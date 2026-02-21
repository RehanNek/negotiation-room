import { v4 as uuidv4 } from 'uuid';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  parseAbi,
  parseEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { all, get, run, flushDb } from '../db';
import { createAttestation } from './attestation';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { computeDealHash, computeTermsHash } from './terms';
import { isEscrowEnabled } from './escrow-config';
import {
  parseAgreedTerms,
  parseContractTerms,
  resolveServiceRoles as resolveServiceRolesFromTerms,
} from './service-roles';
import type {
  ConditionVerdict,
  Escrow,
  EscrowFundedResult,
  EscrowPrepareResult,
  EscrowStatus,
} from '../types';

const ESCROW_ABI = parseAbi([
  'error InvalidVerifier()',
  'error InvalidDealConfig()',
  'error DealAlreadyFunded()',
  'error DealNotFunded()',
  'error DealAlreadyClosed()',
  'error TimeoutNotReached()',
  'error InvalidSignature()',
  'error ValueTransferFailed()',
  'function fundDeal(bytes32 dealHash,address recipientIfTrue,address recipientIfFalse,uint64 timeout) payable',
  'function settleDeal(bytes32 dealHash,bool verdict,bytes32 attestationHash,bytes signature)',
  'function refundAfterTimeout(bytes32 dealHash)',
  'function settlementNonces(bytes32 dealHash) view returns (uint256)',
  'function getDeal(bytes32 dealHash) view returns (uint256 amount,address payer,address recipientIfTrue,address recipientIfFalse,uint64 timeout,bool funded,bool settled,bool refunded,bool releasedToTrue,uint256 settledAmount,bytes32 attestationHash,uint256 nonce)',
  'event DealFunded(bytes32 indexed dealHash,address indexed payer,uint256 amount,address recipientIfTrue,address recipientIfFalse,uint64 timeout)',
  'event DealSettled(bytes32 indexed dealHash,bool verdict,address indexed recipient,uint256 amount,bytes32 attestationHash,uint256 nonce)',
  'event DealRefunded(bytes32 indexed dealHash,address indexed payer,uint256 amount)',
]);

let schedulerTimer: NodeJS.Timeout | null = null;
const settleInFlightContracts = new Set<string>();

export type EscrowRoutingMode = 'warn' | 'enforce';

type EscrowRoutingIssueCode =
  | 'service_explicit_payer_mismatch'
  | 'service_explicit_provider_mismatch'
  | 'service_requester_not_derived_payer'
  | 'service_payer_not_participant'
  | 'service_recipient_true_not_participant'
  | 'service_recipient_false_not_participant'
  | 'recipient_true_equals_payer'
  | 'recipient_true_equals_recipient_false';

type EscrowRoutingIssue = {
  code: EscrowRoutingIssueCode;
  detail: string;
};

export type EscrowRoutingResolution = {
  payerWallet: string;
  recipientIfTrueWallet: string;
  recipientIfFalseWallet: string;
  issues: EscrowRoutingIssue[];
  explicitPayerWallet: string | null;
  explicitProviderWallet: string | null;
  requesterWallet: string | null;
};

type EscrowImmutableIssueCode =
  | 'deal_hash_mismatch'
  | 'chain_id_mismatch'
  | 'amount_wei_mismatch'
  | 'payer_wallet_mismatch'
  | 'recipient_if_true_wallet_mismatch'
  | 'recipient_if_false_wallet_mismatch'
  | 'timeout_at_mismatch'
  | 'contract_address_mismatch';

type EscrowImmutableIssue = {
  code: EscrowImmutableIssueCode;
  detail: string;
};

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEscrowRoutingMode(): EscrowRoutingMode {
  const raw = (process.env.ESCROW_ROUTING_MODE || 'warn').trim().toLowerCase();
  return raw === 'enforce' ? 'enforce' : 'warn';
}

export { isEscrowEnabled } from './escrow-config';

function normalizeWallet(wallet: unknown): string | null {
  if (typeof wallet !== 'string') return null;
  const trimmed = wallet.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function walletsEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isEscrowAddress(value: string): value is `0x${string}` {
  return isAddress(value);
}

function requireEscrowEnabled(): void {
  if (!isEscrowEnabled()) {
    throw conflict('Onchain escrow is disabled for this environment');
  }
}

function getEscrowContractAddress(): `0x${string}` {
  const raw = process.env.ESCROW_CONTRACT_ADDRESS;
  if (!raw) throw badRequest('ESCROW_CONTRACT_ADDRESS is not configured');
  if (!isEscrowAddress(raw)) throw badRequest('ESCROW_CONTRACT_ADDRESS is invalid');
  return getAddress(raw);
}

function getEscrowChainId(): number {
  return envInt('ESCROW_CHAIN_ID', 11155111);
}

function getRpcUrl(): string {
  const url = process.env.ESCROW_RPC_URL;
  if (!url) throw badRequest('ESCROW_RPC_URL is not configured');
  return url;
}

function getVerifierKey(): `0x${string}` {
  const key = process.env.ESCROW_VERIFIER_PRIVATE_KEY;
  if (!key) throw badRequest('ESCROW_VERIFIER_PRIVATE_KEY is not configured');
  return key as `0x${string}`;
}

function getRelayerKey(): `0x${string}` {
  const key = process.env.ESCROW_RELAYER_PRIVATE_KEY;
  if (!key) throw badRequest('ESCROW_RELAYER_PRIVATE_KEY is not configured');
  return key as `0x${string}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(getRpcUrl()),
  });
}

function getRelayerClient() {
  const account = privateKeyToAccount(getRelayerKey());
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(getRpcUrl()),
  });

  return { walletClient, account };
}

export function toEscrowModel(row: any): Escrow {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    deal_hash: String(row.deal_hash),
    status: String(row.status) as EscrowStatus,
    chain_id: Number(row.chain_id),
    asset: 'ETH',
    amount_wei: String(row.amount_wei),
    payer_wallet: String(row.payer_wallet),
    recipient_if_true_wallet: String(row.recipient_if_true_wallet),
    recipient_if_false_wallet: String(row.recipient_if_false_wallet),
    timeout_at: String(row.timeout_at),
    contract_address: String(row.contract_address),
    fund_tx_hash: row.fund_tx_hash ? String(row.fund_tx_hash) : null,
    fund_block_number: row.fund_block_number === null || row.fund_block_number === undefined ? null : Number(row.fund_block_number),
    settle_tx_hash: row.settle_tx_hash ? String(row.settle_tx_hash) : null,
    refund_tx_hash: row.refund_tx_hash ? String(row.refund_tx_hash) : null,
    attestation_id: row.attestation_id ? String(row.attestation_id) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function pickWallet(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeWallet(value);
    if (normalized) return normalized;
  }
  return null;
}

function requireWalletAddress(value: string, label: string): string {
  if (!isAddress(value)) {
    throw badRequest(`${label} is not a valid EVM wallet address`);
  }
  return getAddress(value).toLowerCase();
}

function isParticipantWallet(wallet: string, partyA: string, partyB: string): boolean {
  return walletsEqual(wallet, partyA) || walletsEqual(wallet, partyB);
}

function explicitPayerWallet(terms: Record<string, any>, agreedTerms: Record<string, any>): string | null {
  const payer = pickWallet(
    agreedTerms.payer_wallet,
    agreedTerms.client_wallet,
    agreedTerms.buyer_wallet,
    agreedTerms.requester_wallet,
    terms.payer_wallet,
    terms.client_wallet,
    terms.buyer_wallet,
    terms.requester_wallet
  );
  return payer ? requireWalletAddress(payer, 'payer_wallet') : null;
}

function explicitProviderWallet(terms: Record<string, any>, agreedTerms: Record<string, any>): string | null {
  const provider = pickWallet(
    agreedTerms.provider_wallet,
    agreedTerms.seller_wallet,
    agreedTerms.vendor_wallet,
    terms.provider_wallet,
    terms.seller_wallet,
    terms.vendor_wallet
  );
  return provider ? requireWalletAddress(provider, 'provider_wallet') : null;
}

export function resolveEscrowRouting(params: {
  dealType: string;
  partyA: string;
  partyB: string;
  requesterWallet?: string;
  terms: Record<string, any>;
  agreedTerms: Record<string, any>;
  serviceRoles: { receiverWallet: string; providerWallet: string } | null;
}): EscrowRoutingResolution {
  const {
    dealType,
    partyA,
    partyB,
    requesterWallet,
    terms,
    agreedTerms,
    serviceRoles,
  } = params;
  const issues: EscrowRoutingIssue[] = [];
  const requesterNormalized = normalizeWallet(requesterWallet);

  let payerWallet: string;
  let recipientIfTrueWallet: string;
  let recipientIfFalseWallet: string;
  let explicitPayer: string | null = null;
  let explicitProvider: string | null = null;

  if (dealType === 'service') {
    if (!serviceRoles) {
      throw badRequest('Service roles are required to derive escrow routing');
    }

    const derivedPayer = requireWalletAddress(serviceRoles.receiverWallet, 'service receiver wallet');
    const derivedProvider = requireWalletAddress(serviceRoles.providerWallet, 'service provider wallet');
    explicitPayer = explicitPayerWallet(terms, agreedTerms);
    explicitProvider = explicitProviderWallet(terms, agreedTerms);

    if (explicitPayer && !walletsEqual(explicitPayer, derivedPayer)) {
      issues.push({
        code: 'service_explicit_payer_mismatch',
        detail: `Explicit payer ${explicitPayer} differs from derived receiver payer ${derivedPayer}`,
      });
    }

    if (explicitProvider && !walletsEqual(explicitProvider, derivedProvider)) {
      issues.push({
        code: 'service_explicit_provider_mismatch',
        detail: `Explicit provider ${explicitProvider} differs from derived provider ${derivedProvider}`,
      });
    }

    if (requesterNormalized && !walletsEqual(requesterNormalized, derivedPayer)) {
      issues.push({
        code: 'service_requester_not_derived_payer',
        detail: `Requester ${requesterNormalized} is not the derived service payer ${derivedPayer}`,
      });
    }

    payerWallet = derivedPayer;
    recipientIfTrueWallet = derivedProvider;
    recipientIfFalseWallet = derivedPayer;

    if (!isParticipantWallet(payerWallet, partyA, partyB)) {
      issues.push({
        code: 'service_payer_not_participant',
        detail: `Derived payer ${payerWallet} is not one of contract participants`,
      });
    }
    if (!isParticipantWallet(recipientIfTrueWallet, partyA, partyB)) {
      issues.push({
        code: 'service_recipient_true_not_participant',
        detail: `Derived release recipient ${recipientIfTrueWallet} is not one of contract participants`,
      });
    }
    if (!isParticipantWallet(recipientIfFalseWallet, partyA, partyB)) {
      issues.push({
        code: 'service_recipient_false_not_participant',
        detail: `Derived refund recipient ${recipientIfFalseWallet} is not one of contract participants`,
      });
    }
  } else {
    const payer = pickWallet(
      agreedTerms.payer_wallet,
      agreedTerms.client_wallet,
      agreedTerms.buyer_wallet,
      agreedTerms.requester_wallet,
      terms.payer_wallet,
      terms.client_wallet,
      terms.buyer_wallet,
      terms.requester_wallet,
      partyA
    );
    if (!payer) throw badRequest('Unable to determine payer wallet for escrow');
    payerWallet = requireWalletAddress(payer, 'payer_wallet');

    const counterparty = payerWallet === partyA ? partyB : partyA;
    const recipientTrue = pickWallet(
      agreedTerms.recipient_if_true_wallet,
      terms.recipient_if_true_wallet,
      counterparty
    ) || counterparty;
    const recipientFalse = pickWallet(
      agreedTerms.recipient_if_false_wallet,
      terms.recipient_if_false_wallet,
      payerWallet
    ) || payerWallet;
    recipientIfTrueWallet = requireWalletAddress(recipientTrue, 'recipient_if_true_wallet');
    recipientIfFalseWallet = requireWalletAddress(recipientFalse, 'recipient_if_false_wallet');
  }

  if (walletsEqual(recipientIfTrueWallet, payerWallet)) {
    issues.push({
      code: 'recipient_true_equals_payer',
      detail: `Release recipient ${recipientIfTrueWallet} must differ from payer ${payerWallet}`,
    });
  }
  if (walletsEqual(recipientIfTrueWallet, recipientIfFalseWallet)) {
    issues.push({
      code: 'recipient_true_equals_recipient_false',
      detail: `Release recipient ${recipientIfTrueWallet} must differ from refund recipient ${recipientIfFalseWallet}`,
    });
  }

  return {
    payerWallet,
    recipientIfTrueWallet,
    recipientIfFalseWallet,
    issues,
    explicitPayerWallet: explicitPayer,
    explicitProviderWallet: explicitProvider,
    requesterWallet: requesterNormalized,
  };
}

function logEscrowRoutingMismatch(params: {
  contractId: string;
  mode: EscrowRoutingMode;
  issues: EscrowRoutingIssue[];
  routing: EscrowRoutingResolution;
  dealHash: `0x${string}`;
}): void {
  const { contractId, mode, issues, routing, dealHash } = params;
  console.warn('ESCROW_ROUTING_MISMATCH', {
    contract_id: contractId,
    mode,
    reason_codes: issues.map((issue) => issue.code),
    details: issues.map((issue) => issue.detail),
    requester_wallet: routing.requesterWallet,
    explicit_payer_wallet: routing.explicitPayerWallet,
    explicit_provider_wallet: routing.explicitProviderWallet,
    derived: {
      payer_wallet: routing.payerWallet,
      recipient_if_true_wallet: routing.recipientIfTrueWallet,
      recipient_if_false_wallet: routing.recipientIfFalseWallet,
      deal_hash: dealHash,
    },
  });
}

function immutableEscrowIssues(existing: Escrow, derived: {
  dealHash: `0x${string}`;
  chainId: number;
  amountWei: string;
  payerWallet: string;
  recipientIfTrueWallet: string;
  recipientIfFalseWallet: string;
  timeoutAtIso: string;
  contractAddress: string;
}): EscrowImmutableIssue[] {
  const issues: EscrowImmutableIssue[] = [];

  if (!walletsEqual(existing.deal_hash, derived.dealHash)) {
    issues.push({
      code: 'deal_hash_mismatch',
      detail: `Existing deal hash ${existing.deal_hash} differs from derived ${derived.dealHash}`,
    });
  }
  if (existing.chain_id !== derived.chainId) {
    issues.push({
      code: 'chain_id_mismatch',
      detail: `Existing chain_id ${existing.chain_id} differs from derived ${derived.chainId}`,
    });
  }
  if (existing.amount_wei !== derived.amountWei) {
    issues.push({
      code: 'amount_wei_mismatch',
      detail: `Existing amount_wei ${existing.amount_wei} differs from derived ${derived.amountWei}`,
    });
  }
  if (!walletsEqual(existing.payer_wallet, derived.payerWallet)) {
    issues.push({
      code: 'payer_wallet_mismatch',
      detail: `Existing payer ${existing.payer_wallet} differs from derived ${derived.payerWallet}`,
    });
  }
  if (!walletsEqual(existing.recipient_if_true_wallet, derived.recipientIfTrueWallet)) {
    issues.push({
      code: 'recipient_if_true_wallet_mismatch',
      detail: `Existing recipient_if_true ${existing.recipient_if_true_wallet} differs from derived ${derived.recipientIfTrueWallet}`,
    });
  }
  if (!walletsEqual(existing.recipient_if_false_wallet, derived.recipientIfFalseWallet)) {
    issues.push({
      code: 'recipient_if_false_wallet_mismatch',
      detail: `Existing recipient_if_false ${existing.recipient_if_false_wallet} differs from derived ${derived.recipientIfFalseWallet}`,
    });
  }
  if (existing.timeout_at !== derived.timeoutAtIso) {
    issues.push({
      code: 'timeout_at_mismatch',
      detail: `Existing timeout_at ${existing.timeout_at} differs from derived ${derived.timeoutAtIso}`,
    });
  }
  if (!walletsEqual(existing.contract_address, derived.contractAddress)) {
    issues.push({
      code: 'contract_address_mismatch',
      detail: `Existing contract address ${existing.contract_address} differs from derived ${derived.contractAddress}`,
    });
  }

  return issues;
}

function logEscrowPrepareImmutableMismatch(params: {
  contractId: string;
  mode: EscrowRoutingMode;
  issues: EscrowImmutableIssue[];
  existing: Escrow;
  derived: {
    dealHash: `0x${string}`;
    chainId: number;
    amountWei: string;
    payerWallet: string;
    recipientIfTrueWallet: string;
    recipientIfFalseWallet: string;
    timeoutAtIso: string;
    contractAddress: string;
  };
}): void {
  const { contractId, mode, issues, existing, derived } = params;
  console.warn('ESCROW_PREPARE_IMMUTABLE_MISMATCH', {
    contract_id: contractId,
    mode,
    reason_codes: issues.map((issue) => issue.code),
    details: issues.map((issue) => issue.detail),
    existing: {
      deal_hash: existing.deal_hash,
      chain_id: existing.chain_id,
      amount_wei: existing.amount_wei,
      payer_wallet: existing.payer_wallet,
      recipient_if_true_wallet: existing.recipient_if_true_wallet,
      recipient_if_false_wallet: existing.recipient_if_false_wallet,
      timeout_at: existing.timeout_at,
      contract_address: existing.contract_address,
      status: existing.status,
    },
    derived: {
      deal_hash: derived.dealHash,
      chain_id: derived.chainId,
      amount_wei: derived.amountWei,
      payer_wallet: derived.payerWallet,
      recipient_if_true_wallet: derived.recipientIfTrueWallet,
      recipient_if_false_wallet: derived.recipientIfFalseWallet,
      timeout_at: derived.timeoutAtIso,
      contract_address: derived.contractAddress,
    },
  });
}

function parseAmountWei(terms: Record<string, any>, agreedTerms: Record<string, any>): bigint {
  const directWeiCandidates = [agreedTerms.amount_wei, terms.amount_wei, agreedTerms.escrow_amount_wei, terms.escrow_amount_wei];
  for (const candidate of directWeiCandidates) {
    if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim())) {
      return BigInt(candidate.trim());
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return BigInt(Math.trunc(candidate));
    }
  }

  const ethCandidates = [
    agreedTerms.escrow_eth,
    agreedTerms.amount_eth,
    agreedTerms.stake_eth,
    agreedTerms.deposit_eth,
    terms.escrow_eth,
    terms.amount_eth,
    terms.stake_eth,
    terms.deposit_eth,
  ];

  for (const candidate of ethCandidates) {
    if (candidate === null || candidate === undefined) continue;
    const asString = String(candidate).trim();
    if (!asString) continue;
    try {
      return parseEther(asString);
    } catch {
      // keep searching
    }
  }

  const currency = String(agreedTerms.currency || terms.currency || '').trim().toUpperCase();
  const numericAmount = agreedTerms.price_amount ?? agreedTerms.amount ?? terms.amount ?? terms.price;
  if (currency === 'ETH' && numericAmount !== null && numericAmount !== undefined) {
    try {
      return parseEther(String(numericAmount));
    } catch {
      // fall through to explicit error
    }
  }

  throw badRequest('Escrow amount is missing in ETH. Set agreed_terms.amount_wei or agreed_terms.escrow_eth before funding.');
}

function parseTimeout(contract: any, terms: Record<string, any>, agreedTerms: Record<string, any>): { timeoutAtIso: string; timeoutUnix: bigint } {
  const now = Date.now();
  const defaultSeconds = envInt('ESCROW_SERVICE_TIMEOUT_SECONDS_DEFAULT', 7 * 24 * 60 * 60);

  const timeoutAtCandidate = [
    agreedTerms.timeout_at,
    agreedTerms.timeoutAt,
    agreedTerms.timeout_iso,
    terms.timeout_at,
    terms.timeoutAt,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;

  if (timeoutAtCandidate) {
    const parsed = new Date(timeoutAtCandidate);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now) {
      return { timeoutAtIso: parsed.toISOString(), timeoutUnix: BigInt(Math.floor(parsed.getTime() / 1000)) };
    }
  }

  const timeoutSeconds = [agreedTerms.timeout_seconds, terms.timeout_seconds]
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);
  if (timeoutSeconds) {
    const timeoutMs = now + timeoutSeconds * 1000;
    return { timeoutAtIso: new Date(timeoutMs).toISOString(), timeoutUnix: BigInt(Math.floor(timeoutMs / 1000)) };
  }

  if (typeof contract.resolution_date === 'string' && contract.resolution_date.trim()) {
    const resolution = new Date(contract.resolution_date);
    if (!Number.isNaN(resolution.getTime()) && resolution.getTime() > now) {
      return { timeoutAtIso: resolution.toISOString(), timeoutUnix: BigInt(Math.floor(resolution.getTime() / 1000)) };
    }
  }

  const timeoutMs = now + defaultSeconds * 1000;
  return { timeoutAtIso: new Date(timeoutMs).toISOString(), timeoutUnix: BigInt(Math.floor(timeoutMs / 1000)) };
}

function ensureParticipant(contract: any, requesterWallet?: string): string {
  if (!requesterWallet) throw badRequest('Requester wallet is required');
  const requester = requesterWallet.toLowerCase();
  const partyA = String(contract.party_a_wallet).toLowerCase();
  const partyB = String(contract.party_b_wallet).toLowerCase();
  if (requester !== partyA && requester !== partyB) {
    throw forbidden('You are not a participant in this contract');
  }
  return requester;
}

export function getEscrowByContractId(contractId: string): Escrow | null {
  const row = get('SELECT * FROM escrows WHERE contract_id = ?', [contractId]);
  if (!row) return null;
  return toEscrowModel(row);
}

export function getEscrowForContract(contractId: string, requesterWallet?: string): Escrow {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw notFound('Contract not found');
  ensureParticipant(contract, requesterWallet);

  const escrow = getEscrowByContractId(contractId);
  if (!escrow) throw notFound('Escrow not prepared for this contract yet');
  return escrow;
}

function buildFundTx(escrow: Escrow, timeoutUnix: bigint): { to: string; value_wei: string; data: string } {
  const data = encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: 'fundDeal',
    args: [escrow.deal_hash as Hex, escrow.recipient_if_true_wallet as `0x${string}`, escrow.recipient_if_false_wallet as `0x${string}`, timeoutUnix],
  });

  return {
    to: escrow.contract_address,
    value_wei: escrow.amount_wei,
    data,
  };
}

export async function prepareEscrow(contractId: string, requesterWallet?: string): Promise<EscrowPrepareResult> {
  requireEscrowEnabled();
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw notFound('Contract not found');
  ensureParticipant(contract, requesterWallet);

  const terms = parseContractTerms(contract.terms) as Record<string, any>;
  const agreedTerms = parseAgreedTerms(terms) as Record<string, any>;
  const contractAddress = getEscrowContractAddress();
  const chainId = getEscrowChainId();
  const partyA = String(contract.party_a_wallet).toLowerCase();
  const partyB = String(contract.party_b_wallet).toLowerCase();
  const serviceRoles = String(contract.deal_type) === 'service'
    ? resolveServiceRolesFromTerms({
      partyAWallet: partyA,
      partyBWallet: partyB,
      terms,
      agreedTerms,
    })
    : null;
  const routingMode = getEscrowRoutingMode();
  const routing = resolveEscrowRouting({
    dealType: String(contract.deal_type),
    partyA,
    partyB,
    requesterWallet,
    terms,
    agreedTerms,
    serviceRoles,
  });
  const payerWallet = routing.payerWallet;
  const recipientIfTrue = routing.recipientIfTrueWallet;
  const recipientIfFalse = routing.recipientIfFalseWallet;

  const authIssues = routing.issues.filter((issue) => issue.code === 'service_requester_not_derived_payer');
  if (authIssues.length > 0 && routingMode === 'enforce') {
    throw forbidden('Only the derived escrow payer (service receiver) can prepare escrow');
  }

  const existingRow = get('SELECT * FROM escrows WHERE contract_id = ?', [contractId]);
  const existingEscrow = existingRow ? toEscrowModel(existingRow) : null;

  const amountWei = parseAmountWei(terms, agreedTerms);
  const timeout = existingEscrow
    ? {
      timeoutAtIso: existingEscrow.timeout_at,
      timeoutUnix: BigInt(Math.floor(new Date(existingEscrow.timeout_at).getTime() / 1000)),
    }
    : parseTimeout(contract, terms, agreedTerms);
  const termsHash = String(contract.terms_hash || computeTermsHash(terms));
  const dealHash = computeDealHash({
    contractId,
    termsHash,
    payerWallet,
    recipientIfTrueWallet: recipientIfTrue,
    recipientIfFalseWallet: recipientIfFalse,
    amountWei: amountWei.toString(),
    timeoutAt: timeout.timeoutAtIso,
  });

  if (routing.issues.length > 0) {
    logEscrowRoutingMismatch({
      contractId,
      mode: routingMode,
      issues: routing.issues,
      routing,
      dealHash,
    });

    const nonAuthIssues = routing.issues.filter((issue) => issue.code !== 'service_requester_not_derived_payer');
    if (nonAuthIssues.length > 0 && routingMode === 'enforce') {
      throw conflict('Escrow routing mismatch detected. Align contract roles and wallets before preparing escrow.');
    }
  }

  if (existingEscrow) {
    const fundTx = buildFundTx(existingEscrow, timeout.timeoutUnix);
    if (existingEscrow.status !== 'awaiting_funding' && existingEscrow.status !== 'failed') {
      return { escrow: existingEscrow, fund_tx: fundTx };
    }

    const immutableIssues = immutableEscrowIssues(existingEscrow, {
      dealHash,
      chainId,
      amountWei: amountWei.toString(),
      payerWallet,
      recipientIfTrueWallet: recipientIfTrue,
      recipientIfFalseWallet: recipientIfFalse,
      timeoutAtIso: timeout.timeoutAtIso,
      contractAddress,
    });

    if (immutableIssues.length > 0) {
      logEscrowPrepareImmutableMismatch({
        contractId,
        mode: routingMode,
        issues: immutableIssues,
        existing: existingEscrow,
        derived: {
          dealHash,
          chainId,
          amountWei: amountWei.toString(),
          payerWallet,
          recipientIfTrueWallet: recipientIfTrue,
          recipientIfFalseWallet: recipientIfFalse,
          timeoutAtIso: timeout.timeoutAtIso,
          contractAddress,
        },
      });
      if (routingMode === 'enforce') {
        throw conflict('Escrow is already prepared with immutable routing/terms. Create a new agreement before re-preparing.');
      }
    }

    return { escrow: existingEscrow, fund_tx: fundTx };
  } else {
    const escrowId = uuidv4();
    run(
      `INSERT INTO escrows (id, contract_id, deal_hash, status, chain_id, asset, amount_wei, payer_wallet, recipient_if_true_wallet, recipient_if_false_wallet, timeout_at, contract_address)
       VALUES (?, ?, ?, 'awaiting_funding', ?, 'ETH', ?, ?, ?, ?, ?, ?)`,
      [
        escrowId,
        contractId,
        dealHash,
        chainId,
        amountWei.toString(),
        payerWallet,
        recipientIfTrue,
        recipientIfFalse,
        timeout.timeoutAtIso,
        contractAddress,
      ]
    );
  }

  const attestation = await createAttestation(contractId, 'escrow_prepared', {
    contract_id: contractId,
    deal_hash: dealHash,
    chain_id: chainId,
    asset: 'ETH',
    amount_wei: amountWei.toString(),
    payer_wallet: payerWallet,
    recipient_if_true_wallet: recipientIfTrue,
    recipient_if_false_wallet: recipientIfFalse,
    timeout_at: timeout.timeoutAtIso,
    contract_address: contractAddress,
    prepared_at: new Date().toISOString(),
  });

  run(`UPDATE escrows SET attestation_id = ?, updated_at = datetime('now') WHERE contract_id = ?`, [attestation.id, contractId]);
  flushDb();

  const escrow = getEscrowByContractId(contractId);
  if (!escrow) throw notFound('Escrow could not be prepared');

  const fundTx = buildFundTx(escrow, timeout.timeoutUnix);
  return { escrow, fund_tx: fundTx };
}

export async function markEscrowFunded(contractId: string, txHash: string, requesterWallet?: string): Promise<EscrowFundedResult> {
  requireEscrowEnabled();

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw badRequest('tx_hash must be a valid 0x-prefixed 32-byte hash');
  }

  const contract = get(
    `SELECT c.*, a.data_hash AS contract_attestation_data_hash
     FROM contracts c
     LEFT JOIN attestations a ON a.id = c.attestation_id
     WHERE c.id = ?`,
    [contractId]
  );
  if (!contract) throw notFound('Contract not found');
  const requester = ensureParticipant(contract, requesterWallet);

  const escrow = getEscrowByContractId(contractId);
  if (!escrow) throw notFound('Escrow not prepared for this contract yet');

  if (requester !== escrow.payer_wallet.toLowerCase()) {
    throw forbidden('Only the payer can mark escrow as funded');
  }

  if (escrow.status !== 'awaiting_funding' && escrow.status !== 'failed') {
    throw conflict('Escrow funding has already been recorded');
  }

  const publicClient = getPublicClient();
  const normalizedTxHash = txHash as Hex;
  const [transaction, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: normalizedTxHash }),
    publicClient.getTransactionReceipt({ hash: normalizedTxHash }),
  ]);

  if (!transaction.to || getAddress(transaction.to) !== getAddress(escrow.contract_address)) {
    throw badRequest('Funding transaction target does not match configured escrow contract');
  }

  if (transaction.value !== BigInt(escrow.amount_wei)) {
    throw badRequest('Funding transaction value does not match escrow amount');
  }

  let fundedEventMatched = false;
  for (const log of receipt.logs) {
    if (!log.address || getAddress(log.address) !== getAddress(escrow.contract_address)) continue;

    try {
      const decoded = decodeEventLog({
        abi: ESCROW_ABI,
        data: log.data,
        topics: log.topics,
        strict: false,
      });

      if (decoded.eventName !== 'DealFunded') continue;
      const args = decoded.args as {
        dealHash?: string;
        payer?: string;
        amount?: bigint;
      };

      if (!args.dealHash || args.dealHash.toLowerCase() !== escrow.deal_hash.toLowerCase()) continue;
      if (!args.payer || args.payer.toLowerCase() !== escrow.payer_wallet.toLowerCase()) continue;
      if (!args.amount || args.amount !== BigInt(escrow.amount_wei)) continue;

      fundedEventMatched = true;
      break;
    } catch {
      // Not a DealFunded log.
    }
  }

  if (!fundedEventMatched) {
    throw badRequest('Funding transaction does not emit a matching DealFunded event');
  }

  run(
    `UPDATE escrows
     SET status = 'funded', fund_tx_hash = ?, fund_block_number = ?, last_error = NULL, updated_at = datetime('now')
     WHERE contract_id = ?`,
    [normalizedTxHash, Number(receipt.blockNumber), contractId]
  );

  const attestation = await createAttestation(contractId, 'escrow_funded', {
    contract_id: contractId,
    deal_hash: escrow.deal_hash,
    tx_hash: normalizedTxHash,
    block_number: Number(receipt.blockNumber),
    amount_wei: escrow.amount_wei,
    payer_wallet: escrow.payer_wallet,
    funded_at: new Date().toISOString(),
  });

  run(`UPDATE escrows SET attestation_id = ?, updated_at = datetime('now') WHERE contract_id = ?`, [attestation.id, contractId]);
  flushDb();

  const updated = getEscrowByContractId(contractId);
  if (!updated) throw notFound('Escrow not found after funding update');

  // If contract was already resolved while waiting for funding, settle immediately.
  if (String(contract.status) === 'resolved' && (contract.verdict === 'TRUE' || contract.verdict === 'FALSE')) {
    const verdict = contract.verdict as ConditionVerdict;
    // Settlement can take >10s due to block times and should not block the HTTP request (Vercel proxy timeout).
    tryAutoSettleEscrow(
      contractId,
      verdict,
      contract.attestation_id ? String(contract.attestation_id) : null,
      contract.contract_attestation_data_hash ? `0x${String(contract.contract_attestation_data_hash)}` : null
    ).catch((error: unknown) => {
      console.error('Auto-settle escrow failed after funding mark', {
        contractId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    escrow: updated,
    attestation,
  };
}

async function settleEscrowOnchain(params: {
  escrow: Escrow;
  verdict: ConditionVerdict;
  attestationId: string | null;
  attestationHashHex: `0x${string}`;
}): Promise<void> {
  const { escrow, verdict, attestationId, attestationHashHex } = params;
  const boolVerdict = verdict === 'TRUE';

  const publicClient = getPublicClient();
  const { walletClient, account } = getRelayerClient();
  const verifier = privateKeyToAccount(getVerifierKey());

  const nonce = await publicClient.readContract({
    address: escrow.contract_address as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'settlementNonces',
    args: [escrow.deal_hash as Hex],
  });

  const chainId = getEscrowChainId();
  const signature = await verifier.signTypedData({
    domain: {
      name: 'TheRoomEscrowVault',
      version: '1',
      chainId,
      verifyingContract: escrow.contract_address as `0x${string}`,
    },
    types: {
      Settlement: [
        { name: 'dealHash', type: 'bytes32' },
        { name: 'verdict', type: 'bool' },
        { name: 'attestationHash', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'Settlement',
    message: {
      dealHash: escrow.deal_hash as Hex,
      verdict: boolVerdict,
      attestationHash: attestationHashHex,
      nonce,
    },
  });

  const txHash = await walletClient.writeContract({
    account,
    chain: sepolia,
    address: escrow.contract_address as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'settleDeal',
    args: [escrow.deal_hash as Hex, boolVerdict, attestationHashHex, signature],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error('Settlement transaction reverted');
  }

  const status: EscrowStatus = boolVerdict ? 'released' : 'refunded';

  run(
    `UPDATE escrows SET status = ?, settle_tx_hash = ?, attestation_id = ?, last_error = NULL, updated_at = datetime('now') WHERE contract_id = ?`,
    [status, txHash, attestationId, escrow.contract_id]
  );

  const escrowAttestation = await createAttestation(escrow.contract_id, 'escrow_settled', {
    contract_id: escrow.contract_id,
    deal_hash: escrow.deal_hash,
    verdict,
    attestation_id: attestationId,
    attestation_hash: attestationHashHex,
    tx_hash: txHash,
    status,
    settled_at: new Date().toISOString(),
  });

  run(`UPDATE escrows SET attestation_id = ?, updated_at = datetime('now') WHERE contract_id = ?`, [escrowAttestation.id, escrow.contract_id]);
  flushDb();
}

async function reconcileEscrowTerminalStateFromChain(escrow: Escrow, attestationId: string | null): Promise<boolean> {
  const publicClient = getPublicClient();
  const onchainDeal = await publicClient.readContract({
    address: escrow.contract_address as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'getDeal',
    args: [escrow.deal_hash as Hex],
  });

  const settled = Boolean(onchainDeal?.[6]);
  const refunded = Boolean(onchainDeal?.[7]);
  const releasedToTrue = Boolean(onchainDeal?.[8]);

  if (!settled && !refunded) {
    return false;
  }

  const reconciledStatus: EscrowStatus = settled
    ? (releasedToTrue ? 'released' : 'refunded')
    : 'refunded';

  run(
    `UPDATE escrows
     SET status = ?, attestation_id = COALESCE(?, attestation_id), last_error = NULL, updated_at = datetime('now')
     WHERE contract_id = ?`,
    [reconciledStatus, attestationId, escrow.contract_id]
  );
  flushDb();
  return true;
}

export async function tryAutoSettleEscrow(
  contractId: string,
  verdict: ConditionVerdict,
  attestationId: string | null,
  attestationHashHex?: `0x${string}` | null
): Promise<void> {
  if (!isEscrowEnabled()) return;

  if (verdict !== 'TRUE' && verdict !== 'FALSE') return;

  const escrow = getEscrowByContractId(contractId);
  if (!escrow) return;
  if (escrow.status !== 'funded' && escrow.status !== 'failed') return;
  if (settleInFlightContracts.has(contractId)) return;

  const hash = attestationHashHex || (`0x${'0'.repeat(64)}` as `0x${string}`);
  settleInFlightContracts.add(contractId);

  try {
    if ((escrow.settle_tx_hash || escrow.refund_tx_hash) && await reconcileEscrowTerminalStateFromChain(escrow, attestationId)) {
      return;
    }

    await settleEscrowOnchain({
      escrow,
      verdict,
      attestationId,
      attestationHashHex: hash,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('DealAlreadyClosed') || errorMessage.includes('0xe20d8067')) {
      try {
        if (await reconcileEscrowTerminalStateFromChain(escrow, attestationId)) {
          return;
        }
      } catch {
        // Fall through to generic error persistence if chain reconciliation fails.
      }
    }

    run(
      // Keep status unchanged (avoid clobbering a concurrently written terminal state); capture the failure for retry/debugging.
      `UPDATE escrows
       SET last_error = ?, updated_at = datetime('now')
       WHERE contract_id = ? AND status IN ('funded', 'failed')`,
      [errorMessage, contractId]
    );
    flushDb();
  } finally {
    settleInFlightContracts.delete(contractId);
  }
}

async function refundEscrowOnchain(escrow: Escrow): Promise<void> {
  const publicClient = getPublicClient();
  const { walletClient, account } = getRelayerClient();

  const txHash = await walletClient.writeContract({
    account,
    chain: sepolia,
    address: escrow.contract_address as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'refundAfterTimeout',
    args: [escrow.deal_hash as Hex],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error('Timeout refund transaction reverted');
  }

  run(
    `UPDATE escrows SET status = 'refunded', refund_tx_hash = ?, last_error = NULL, updated_at = datetime('now') WHERE contract_id = ?`,
    [txHash, escrow.contract_id]
  );

  const attestation = await createAttestation(escrow.contract_id, 'escrow_refunded_timeout', {
    contract_id: escrow.contract_id,
    deal_hash: escrow.deal_hash,
    timeout_at: escrow.timeout_at,
    tx_hash: txHash,
    refunded_at: new Date().toISOString(),
  });
  run(`UPDATE escrows SET attestation_id = ?, updated_at = datetime('now') WHERE contract_id = ?`, [attestation.id, escrow.contract_id]);
  flushDb();
}

async function schedulerTick(): Promise<void> {
  if (!isEscrowEnabled()) return;

  const nowIso = new Date().toISOString();
  const funded = all(
    `SELECT e.*, c.status AS contract_status, c.verdict AS contract_verdict, c.attestation_id AS contract_attestation_id, a.data_hash AS contract_attestation_data_hash
     FROM escrows e
     JOIN contracts c ON c.id = e.contract_id
     LEFT JOIN attestations a ON a.id = c.attestation_id
     WHERE e.status IN ('funded', 'failed')`
  );

  for (const row of funded) {
    const escrow = toEscrowModel(row);

    if (escrow.settle_tx_hash || escrow.refund_tx_hash) {
      try {
        if (await reconcileEscrowTerminalStateFromChain(
          escrow,
          row.contract_attestation_id ? String(row.contract_attestation_id) : null
        )) {
          continue;
        }
      } catch {
        // Keep running normal settlement/refund paths below when chain reconciliation is unavailable.
      }
    }

    if (row.contract_status === 'resolved' && (row.contract_verdict === 'TRUE' || row.contract_verdict === 'FALSE')) {
      await tryAutoSettleEscrow(
        escrow.contract_id,
        row.contract_verdict as ConditionVerdict,
        row.contract_attestation_id ? String(row.contract_attestation_id) : null,
        row.contract_attestation_data_hash ? (`0x${String(row.contract_attestation_data_hash)}` as `0x${string}`) : null
      );
      continue;
    }

    if (escrow.status === 'funded' && escrow.timeout_at <= nowIso) {
      try {
        await refundEscrowOnchain(escrow);
      } catch (error: unknown) {
        run(
          // Keep status unchanged and capture the failure for retry/debugging.
          `UPDATE escrows
           SET last_error = ?, updated_at = datetime('now')
           WHERE contract_id = ? AND status = 'funded'`,
          [error instanceof Error ? error.message : String(error), escrow.contract_id]
        );
        flushDb();
      }
    }
  }
}

export async function runEscrowSchedulerTickForTest(): Promise<void> {
  await schedulerTick();
}

export function startEscrowScheduler(): void {
  if (!isEscrowEnabled()) return;
  if (schedulerTimer) return;

  const intervalMs = envInt('ESCROW_AUTORELAY_INTERVAL_MS', 15000);
  schedulerTimer = setInterval(() => {
    void schedulerTick().catch((err) => {
      console.error('Escrow scheduler tick failed:', err);
    });
  }, intervalMs > 0 ? intervalMs : 15000);

  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }
}

export function stopEscrowScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}
