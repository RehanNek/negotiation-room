import { v4 as uuidv4 } from 'uuid';
import { run, get, all, flushDb } from '../db';
import { evaluateCondition } from './ai';
import { fetchExternalData } from './external';
import { createAttestation } from './attestation';
import { getEscrowByContractId, tryAutoSettleEscrow } from './escrow';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import type { ConditionVerdict } from '../types';

interface CreateContractParams {
  negotiation_id: string;
  deal_type: string;
  terms: Record<string, any>;
  summary: string;
  party_a_wallet: string;
  party_b_wallet: string;
  condition_desc?: string;
  condition_data_source?: string;
  resolution_date?: string;
  terms_hash?: string;
  confirmed_by_a_at?: string | null;
  confirmed_by_b_at?: string | null;
}

function normalizeWallet(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function parseContractTerms(rawTerms: unknown): Record<string, any> {
  if (typeof rawTerms !== 'string') return {};
  try {
    const parsed = JSON.parse(rawTerms);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
  } catch {
    return {};
  }
  return {};
}

function parseAgreedTerms(terms: Record<string, any>): Record<string, any> {
  const agreed = terms.agreed_terms;
  if (agreed && typeof agreed === 'object' && !Array.isArray(agreed)) {
    return agreed as Record<string, any>;
  }
  return {};
}

function resolveServiceRoles(contract: any): {
  receiverWallet: string;
  providerWallet: string;
  terms: Record<string, any>;
  agreedTerms: Record<string, any>;
} {
  const terms = parseContractTerms(contract.terms);
  const agreedTerms = parseAgreedTerms(terms);
  const explicitReceiver = [
    terms.receiver_wallet,
    agreedTerms.receiver_wallet,
    agreedTerms.client_wallet,
    agreedTerms.buyer_wallet,
    agreedTerms.requester_wallet,
    terms.client_wallet,
    terms.buyer_wallet,
    terms.requester_wallet,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;

  const receiverWallet = explicitReceiver || (contract.party_a_wallet as string);
  const receiverNormalized = normalizeWallet(receiverWallet);
  const partyANormalized = normalizeWallet(contract.party_a_wallet);
  const providerWallet = receiverNormalized && partyANormalized && receiverNormalized === partyANormalized
    ? (contract.party_b_wallet as string)
    : (contract.party_a_wallet as string);

  return {
    receiverWallet,
    providerWallet,
    terms,
    agreedTerms,
  };
}

export function createContract(params: CreateContractParams): any {
  const id = uuidv4();
  const status = params.deal_type === 'conditional' ? 'pending_resolution' : 'active';

  run(
    `INSERT INTO contracts (
      id,
      negotiation_id,
      deal_type,
      terms,
      summary,
      party_a_wallet,
      party_b_wallet,
      status,
      condition_desc,
      condition_data_source,
      resolution_date,
      terms_hash,
      confirmed_by_a_at,
      confirmed_by_b_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.negotiation_id, params.deal_type, JSON.stringify(params.terms), params.summary,
     params.party_a_wallet, params.party_b_wallet, status,
     params.condition_desc || null, params.condition_data_source || null, params.resolution_date || null,
     params.terms_hash || null, params.confirmed_by_a_at || null, params.confirmed_by_b_at || null]
  );

  if (params.deal_type === 'conditional' && params.condition_desc) {
    const condId = uuidv4();
    run(
      `INSERT INTO conditions (id, contract_id, description, data_source, threshold, resolution_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [condId, id, params.condition_desc,
       params.condition_data_source || 'manual',
       params.terms.threshold || '',
       params.resolution_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()]
    );
  }

  const createdAt = new Date().toISOString();
  const dealAttestation = createAttestation(id, 'deal_recorded', {
    contract_id: id,
    negotiation_id: params.negotiation_id,
    deal_type: params.deal_type,
    status,
    terms_hash: params.terms_hash || null,
    confirmed_by_a_at: params.confirmed_by_a_at || null,
    confirmed_by_b_at: params.confirmed_by_b_at || null,
    party_a_wallet: params.party_a_wallet,
    party_b_wallet: params.party_b_wallet,
    terms: params.terms,
    summary: params.summary,
    created_at: createdAt,
  });

  run(`UPDATE contracts SET attestation_id = ? WHERE id = ?`, [dealAttestation.id, id]);

  return getContract(id);
}

export function getContract(contractId: string, requesterWallet?: string): any {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) return null;
  if (
    requesterWallet &&
    requesterWallet !== contract.party_a_wallet &&
    requesterWallet !== contract.party_b_wallet
  ) {
    throw forbidden('You are not a participant in this contract');
  }

  const conditions = all('SELECT * FROM conditions WHERE contract_id = ?', [contractId]);
  const escrow = getEscrowByContractId(contractId);

  return {
    ...contract,
    terms: JSON.parse(contract.terms as string),
    conditions,
    escrow: escrow || undefined,
  };
}

export function getContractsByWallet(wallet: string, requesterWallet?: string): any[] {
  if (requesterWallet && requesterWallet !== wallet) {
    throw forbidden('You can only access your own contracts');
  }

  const contracts = all(
    'SELECT * FROM contracts WHERE party_a_wallet = ? OR party_b_wallet = ? ORDER BY created_at DESC',
    [wallet, wallet]
  );

  return contracts.map((c: any) => ({
    ...c,
    terms: JSON.parse(c.terms as string),
    escrow: getEscrowByContractId(String(c.id)) || undefined,
  }));
}

export async function resolveCondition(contractId: string, requesterWallet?: string): Promise<any> {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw notFound('Contract not found');
  if (
    requesterWallet &&
    requesterWallet !== contract.party_a_wallet &&
    requesterWallet !== contract.party_b_wallet
  ) {
    throw forbidden('You are not a participant in this contract');
  }
  if (contract.deal_type !== 'conditional') throw badRequest('Not a conditional contract');
  if (contract.status === 'resolved') throw conflict('Contract already resolved');

  const condition = get('SELECT * FROM conditions WHERE contract_id = ?', [contractId]);
  if (!condition) throw notFound('No condition found for this contract');

  const terms = JSON.parse(contract.terms as string);
  const externalData = await fetchExternalData(condition.data_source as string, {
    coin_id: contract.condition_data_source === 'coingecko' ? (terms.coin_id || 'bitcoin') : undefined,
    query: condition.description as string,
  });

  const evaluation = await evaluateCondition(condition.description as string, externalData);
  const verdict = evaluation.verdict as ConditionVerdict;

  run(
    `UPDATE conditions SET verdict = ?, evidence = ?, reasoning = ?, checked_at = datetime('now') WHERE id = ?`,
    [verdict, JSON.stringify(externalData), evaluation.reasoning, condition.id as string]
  );

  const attestation = createAttestation(contractId, 'condition_resolution', {
    contract_id: contractId,
    condition: condition.description,
    external_data: externalData,
    verdict,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    resolved_at: new Date().toISOString(),
  });

  run(
    `UPDATE contracts SET status = 'resolved', verdict = ?, verdict_reasoning = ?, attestation_id = ?, resolved_at = datetime('now') WHERE id = ?`,
    [verdict, evaluation.reasoning, attestation.id, contractId]
  );
  flushDb();
  await tryAutoSettleEscrow(
    contractId,
    verdict,
    attestation.id,
    (`0x${attestation.data_hash}` as `0x${string}`)
  );

  return {
    contract_id: contractId,
    verdict,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    external_data: externalData,
    attestation,
  };
}

export async function affirmServiceDelivery(contractId: string, requesterWallet?: string): Promise<any> {
  const contract = get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw notFound('Contract not found');
  if (!requesterWallet) throw badRequest('Requester wallet is required');
  if (contract.deal_type !== 'service') throw badRequest('Only service contracts can be affirmed');
  if (contract.status === 'resolved') throw conflict('Contract already resolved');
  if (contract.status !== 'active') throw conflict('Contract is not awaiting service delivery affirmation');

  const requesterNormalized = normalizeWallet(requesterWallet);
  const partyANormalized = normalizeWallet(contract.party_a_wallet);
  const partyBNormalized = normalizeWallet(contract.party_b_wallet);
  if (requesterNormalized !== partyANormalized && requesterNormalized !== partyBNormalized) {
    throw forbidden('You are not a participant in this contract');
  }

  const { receiverWallet, providerWallet, terms, agreedTerms } = resolveServiceRoles(contract);
  if (requesterNormalized !== normalizeWallet(receiverWallet)) {
    throw forbidden('Only the service receiver can affirm delivery and release escrow');
  }

  const escrowAmount =
    terms.amount ??
    terms.price ??
    agreedTerms.price_amount ??
    agreedTerms.amount ??
    agreedTerms.price ??
    null;
  const escrowCurrency =
    terms.currency ??
    terms.token ??
    agreedTerms.currency ??
    agreedTerms.token ??
    null;
  const resolvedAt = new Date().toISOString();
  const reasoning = 'Service receiver affirmed completion. Demo escrow release recorded for service provider.';

  const attestation = createAttestation(contractId, 'service_affirmation', {
    contract_id: contractId,
    action: 'service_delivery_affirmed',
    verdict: 'TRUE',
    affirmed_by: requesterWallet,
    receiver_wallet: receiverWallet,
    provider_wallet: providerWallet,
    escrow_release: {
      mode: 'demo',
      status: 'released',
      amount: escrowAmount,
      currency: escrowCurrency,
    },
    resolved_at: resolvedAt,
  });

  run(
    `UPDATE contracts SET status = 'resolved', verdict = 'TRUE', verdict_reasoning = ?, attestation_id = ?, resolved_at = datetime('now') WHERE id = ?`,
    [reasoning, attestation.id, contractId]
  );
  flushDb();
  await tryAutoSettleEscrow(
    contractId,
    'TRUE',
    attestation.id,
    (`0x${attestation.data_hash}` as `0x${string}`)
  );

  return {
    contract_id: contractId,
    verdict: 'TRUE',
    reasoning,
    receiver_wallet: receiverWallet,
    provider_wallet: providerWallet,
    attestation,
  };
}
