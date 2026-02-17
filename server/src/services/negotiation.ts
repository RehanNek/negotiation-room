import { v4 as uuidv4 } from 'uuid';
import { formatEther, parseEther } from 'viem';
import { run, get, all, flushDb } from '../db';
import {
  parseOfferToStructured,
  generateSuggestion,
  generateContractSummary,
  extractNegotiatedTerms,
} from './ai';
import { createContract, getContract } from './contract';
import { updateReputation } from './reputation';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { isDemoModeEnabled } from './auth';
import { computeTermsHash } from './terms';
import type {
  CreateNegotiationRequest,
  FinalizeNegotiationPendingResult,
  FinalizeNegotiationResult,
  JoinNegotiationRequest,
  SubmitOfferRequest,
} from '../types';

interface FinalRoundSnapshot {
  party: string;
  offer_structured: Record<string, any>;
  offer_raw?: string;
}

function normalizeEscrowAmountEthInput(value: string): { amountEth: string; amountWei: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    throw badRequest('escrow_amount_eth is required before confirming done');
  }

  let wei: bigint;
  try {
    wei = parseEther(trimmed);
  } catch {
    throw badRequest('escrow_amount_eth must be a valid ETH amount');
  }

  if (wei <= 0n) {
    throw badRequest('escrow_amount_eth must be greater than zero');
  }

  return {
    amountEth: formatEther(wei),
    amountWei: wei.toString(),
  };
}

function extractEscrowAmountWei(terms: Record<string, any>): bigint | null {
  const agreed = terms.agreed_terms && typeof terms.agreed_terms === 'object' && !Array.isArray(terms.agreed_terms)
    ? (terms.agreed_terms as Record<string, any>)
    : {};

  const weiCandidates = [
    agreed.amount_wei,
    terms.amount_wei,
    agreed.escrow_amount_wei,
    terms.escrow_amount_wei,
  ];

  for (const candidate of weiCandidates) {
    if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim())) {
      const value = BigInt(candidate.trim());
      if (value > 0n) return value;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return BigInt(Math.trunc(candidate));
    }
  }

  const ethCandidates = [
    agreed.escrow_eth,
    agreed.amount_eth,
    terms.escrow_eth,
    terms.amount_eth,
  ];

  for (const candidate of ethCandidates) {
    if (candidate === null || candidate === undefined) continue;
    const asString = String(candidate).trim();
    if (!asString) continue;
    try {
      const parsed = parseEther(asString);
      if (parsed > 0n) return parsed;
    } catch {
      // skip invalid candidate
    }
  }

  return null;
}

function applyEscrowAmountToTerms(terms: Record<string, any>, amountEth: string, amountWei: string): Record<string, any> {
  const next: Record<string, any> = { ...terms };
  const agreedSource = next.agreed_terms && typeof next.agreed_terms === 'object' && !Array.isArray(next.agreed_terms)
    ? (next.agreed_terms as Record<string, any>)
    : {};

  next.agreed_terms = {
    ...agreedSource,
    escrow_eth: amountEth,
    amount_wei: amountWei,
  };

  next.escrow_eth = amountEth;
  next.amount_wei = amountWei;
  return next;
}

async function buildFinalTerms(
  rounds: FinalRoundSnapshot[],
  dealType: string,
  category: string
): Promise<Record<string, any>> {
  const lastA = [...rounds].reverse().find((round) => round.party === 'A');
  const lastB = [...rounds].reverse().find((round) => round.party === 'B');
  const extracted = await extractNegotiatedTerms(rounds, dealType, category);

  if (!lastA && !lastB) return {};

  const terms: Record<string, any> = {
    party_a_offer: lastA?.offer_structured || {},
    party_b_offer: lastB?.offer_structured || {},
    party_a_message: lastA?.offer_raw || null,
    party_b_message: lastB?.offer_raw || null,
    agreed_terms: extracted.agreed_terms,
    missing_terms: extracted.missing_terms,
    term_extraction_confidence: extracted.confidence,
  };

  const agreedTerms = extracted.agreed_terms || {};
  if (typeof agreedTerms === 'object' && agreedTerms !== null) {
    if (agreedTerms.price_amount !== undefined && agreedTerms.price_amount !== null) {
      terms.amount = agreedTerms.price_amount;
    }
    if (agreedTerms.currency !== undefined && agreedTerms.currency !== null) {
      terms.currency = agreedTerms.currency;
    }
    if (agreedTerms.timeline) {
      terms.timeline = agreedTerms.timeline;
    }
    if (agreedTerms.deadline) {
      terms.deadline = agreedTerms.deadline;
    }
  }

  return terms;
}

export function createNegotiation(req: CreateNegotiationRequest): { room_id: string; negotiation: any } {
  const id = uuidv4();
  run(
    `INSERT INTO negotiations (id, deal_type, category, params, party_a_wallet, party_a_constraints) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.deal_type, req.category, JSON.stringify(req.params), req.wallet_address, JSON.stringify(req.constraints)]
  );

  return {
    room_id: id,
    negotiation: {
      id,
      deal_type: req.deal_type,
      category: req.category,
      status: 'waiting',
      party_a_wallet: req.wallet_address,
    },
  };
}

export function joinNegotiation(req: JoinNegotiationRequest): { negotiation: any } {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [req.room_id]);
  if (!neg) throw notFound('Room not found');
  if (neg.status !== 'waiting') throw conflict('Room is not accepting new participants');
  if (neg.party_a_wallet === req.wallet_address && !isDemoModeEnabled()) {
    throw conflict('Cannot join your own room');
  }

  run(
    `UPDATE negotiations SET party_b_wallet = ?, party_b_constraints = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`,
    [req.wallet_address, JSON.stringify(req.constraints), req.room_id]
  );

  return {
    negotiation: {
      id: req.room_id,
      deal_type: neg.deal_type,
      category: neg.category,
      status: 'active',
      party_a_wallet: neg.party_a_wallet,
      party_b_wallet: req.wallet_address,
    },
  };
}

export async function submitOffer(req: SubmitOfferRequest): Promise<{
  round: any;
  suggestion: any;
  negotiation_status: string;
  contract?: any;
}> {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [req.negotiation_id]);
  if (!neg) throw notFound('Negotiation not found');
  if (neg.status !== 'active') throw conflict('Negotiation is not active');

  const existingRounds = all(
    'SELECT * FROM rounds WHERE negotiation_id = ? ORDER BY round_number, created_at',
    [req.negotiation_id]
  );
  const messageIndex = existingRounds.length + 1;

  let party: 'A' | 'B';
  if (neg.party_a_wallet === neg.party_b_wallet) {
    // Demo mode: same wallet is both parties — alternate per message.
    const previousParty = existingRounds.length > 0 ? (existingRounds[existingRounds.length - 1]?.party as 'A' | 'B') : null;
    party = previousParty === 'A' ? 'B' : 'A';
  } else if (req.wallet_address === neg.party_a_wallet) {
    party = 'A';
  } else if (req.wallet_address === neg.party_b_wallet) {
    party = 'B';
  } else {
    throw forbidden('You are not a participant in this negotiation');
  }

  let offerStructured: Record<string, any>;
  let offerRaw: string;

  if (req.structured && typeof req.offer === 'object') {
    offerStructured = req.offer as Record<string, any>;
    offerRaw = JSON.stringify(req.offer);
  } else {
    offerRaw = typeof req.offer === 'string' ? req.offer : JSON.stringify(req.offer);
    const parsed = await parseOfferToStructured(offerRaw, neg.category as string, JSON.parse(neg.params as string));
    offerStructured = parsed.terms;
  }

  const constraints = party === 'A'
    ? JSON.parse(neg.party_a_constraints as string)
    : JSON.parse(neg.party_b_constraints as string);
  const allRoundsBeforeMessage: FinalRoundSnapshot[] = existingRounds.map((r: any) => ({
    party: r.party as string,
    offer_raw: r.offer_raw as string,
    offer_structured: JSON.parse(r.offer_structured as string),
  }));
  const allRoundsNow: FinalRoundSnapshot[] = [
    ...allRoundsBeforeMessage,
    { party, offer_raw: offerRaw, offer_structured: offerStructured },
  ];

  const roundId = uuidv4();
  run(
    `INSERT INTO rounds (id, negotiation_id, round_number, party, offer_raw, offer_structured, ai_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [roundId, req.negotiation_id, messageIndex, party, offerRaw, JSON.stringify(offerStructured), null]
  );
  run(
    `UPDATE negotiations
     SET current_round = ?,
         final_terms_draft = NULL,
         final_terms_hash = NULL,
         party_a_confirmed_terms_hash = NULL,
         party_b_confirmed_terms_hash = NULL,
         party_a_done_at = NULL,
         party_b_done_at = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
    [messageIndex, req.negotiation_id]
  );

  const suggestion = await generateSuggestion(
    neg.category as string,
    JSON.parse(neg.params as string),
    allRoundsNow,
    party,
    constraints
  );
  run(`UPDATE rounds SET ai_suggestion = ? WHERE id = ?`, [suggestion.suggestion, roundId]);
  flushDb();

  return {
    round: { id: roundId, round_number: messageIndex, party, offer_structured: offerStructured },
    suggestion,
    negotiation_status: 'active',
  };
}

export async function finalizeNegotiationDeal(
  negotiationId: string,
  walletAddress: string,
  providedTermsHash?: string,
  providedEscrowAmountEth?: string
): Promise<FinalizeNegotiationResult> {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!neg) throw notFound('Negotiation not found');
  if (walletAddress !== neg.party_a_wallet && walletAddress !== neg.party_b_wallet) {
    throw forbidden('You are not a participant in this negotiation');
  }
  const confirmedEscrow = normalizeEscrowAmountEthInput(providedEscrowAmountEth || '');

  if (neg.status === 'waiting') {
    throw conflict('Counterparty has not joined this negotiation');
  }
  if (neg.status === 'no_deal' || neg.status === 'impasse') {
    throw conflict('Negotiation is closed');
  }

  const existingContractRow = get(
    `SELECT id FROM contracts WHERE negotiation_id = ? ORDER BY created_at DESC LIMIT 1`,
    [negotiationId]
  );
  if (existingContractRow?.id) {
    if (neg.status !== 'deal') {
      run(`UPDATE negotiations SET status = 'deal', updated_at = datetime('now') WHERE id = ?`, [negotiationId]);
      flushDb();
    }
    const existingContract = getContract(existingContractRow.id as string, walletAddress);
    if (!existingContract) throw notFound('Contract not found');
    return { status: 'deal', contract: existingContract };
  }

  const rows = all(
    'SELECT party, offer_raw, offer_structured FROM rounds WHERE negotiation_id = ? ORDER BY round_number, created_at',
    [negotiationId]
  );
  if (rows.length === 0) {
    throw conflict('Cannot mark done before any messages are sent');
  }

  const rounds: FinalRoundSnapshot[] = rows.map((row: any) => ({
    party: row.party as string,
    offer_raw: row.offer_raw as string,
    offer_structured: JSON.parse(row.offer_structured as string),
  }));

  if (neg.party_a_wallet !== neg.party_b_wallet) {
    const hasA = rounds.some((round) => round.party === 'A');
    const hasB = rounds.some((round) => round.party === 'B');
    if (!hasA || !hasB) {
      throw conflict('Both parties must send at least one message before marking done');
    }
  }

  let termsDraft: Record<string, any> = {};
  let termsHash = typeof neg.final_terms_hash === 'string' && neg.final_terms_hash.trim()
    ? String(neg.final_terms_hash)
    : '';

  if (typeof neg.final_terms_draft === 'string' && neg.final_terms_draft.trim()) {
    try {
      const parsed = JSON.parse(neg.final_terms_draft as string);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        termsDraft = parsed as Record<string, any>;
      }
    } catch {
      termsDraft = {};
    }
  }

  let mustPersistDraft = false;

  if (!termsHash || Object.keys(termsDraft).length === 0) {
    termsDraft = await buildFinalTerms(rounds, neg.deal_type as string, neg.category as string);
    mustPersistDraft = true;
  }

  const existingEscrowWei = extractEscrowAmountWei(termsDraft);
  if (existingEscrowWei !== null && existingEscrowWei !== BigInt(confirmedEscrow.amountWei)) {
    throw conflict(
      `Escrow amount mismatch. Confirm ${formatEther(existingEscrowWei)} ETH or send a new offer before confirming done.`
    );
  }

  termsDraft = applyEscrowAmountToTerms(termsDraft, confirmedEscrow.amountEth, confirmedEscrow.amountWei);
  const recomputedTermsHash = computeTermsHash(termsDraft);
  if (!termsHash || termsHash !== recomputedTermsHash) {
    termsHash = recomputedTermsHash;
    mustPersistDraft = true;
  }

  if (mustPersistDraft) {
    run(
      `UPDATE negotiations SET final_terms_draft = ?, final_terms_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(termsDraft), termsHash, negotiationId]
    );
  }

  if (providedTermsHash && providedTermsHash.trim() && providedTermsHash.trim() !== termsHash) {
    throw conflict('Terms hash mismatch. Refresh draft terms and confirm again.');
  }

  const confirmationTime = new Date().toISOString();
  const requesterParty: 'A' | 'B' = walletAddress === neg.party_a_wallet ? 'A' : 'B';
  const isSelfNegotiation = neg.party_a_wallet === neg.party_b_wallet;

  if (isSelfNegotiation) {
    run(
      `UPDATE negotiations
       SET party_a_confirmed_terms_hash = ?,
           party_b_confirmed_terms_hash = ?,
           party_a_done_at = ?,
           party_b_done_at = ?,
           status = 'deal',
           updated_at = datetime('now')
       WHERE id = ?`,
      [termsHash, termsHash, confirmationTime, confirmationTime, negotiationId]
    );
  } else if (requesterParty === 'A') {
    run(
      `UPDATE negotiations
       SET party_a_confirmed_terms_hash = ?, party_a_done_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [termsHash, confirmationTime, negotiationId]
    );
  } else {
    run(
      `UPDATE negotiations
       SET party_b_confirmed_terms_hash = ?, party_b_done_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [termsHash, confirmationTime, negotiationId]
    );
  }

  const refreshed = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!refreshed) throw notFound('Negotiation not found');

  const partyAConfirmed = refreshed.party_a_confirmed_terms_hash as string | null;
  const partyBConfirmed = refreshed.party_b_confirmed_terms_hash as string | null;
  const bothConfirmed =
    typeof partyAConfirmed === 'string' &&
    typeof partyBConfirmed === 'string' &&
    partyAConfirmed === termsHash &&
    partyBConfirmed === termsHash;

  if (!bothConfirmed) {
    flushDb();
    const pending: FinalizeNegotiationPendingResult = {
      status: 'awaiting_other_party_confirmation',
      negotiation_id: negotiationId,
      terms_hash: termsHash,
      terms_draft: termsDraft,
      confirmed_by_party: requesterParty,
    };
    return pending;
  }

  const contract = await finalizeContract(refreshed, rounds, termsDraft, termsHash);
  updateReputation(refreshed.party_a_wallet as string, 'deal', rounds.length);
  updateReputation(refreshed.party_b_wallet as string, 'deal', rounds.length);
  flushDb();

  return { status: 'deal', contract };
}

async function finalizeContract(
  neg: any,
  rounds: FinalRoundSnapshot[],
  termsInput?: Record<string, any>,
  termsHashInput?: string
): Promise<any> {
  const terms = termsInput || (await buildFinalTerms(rounds, neg.deal_type as string, neg.category as string));
  const termsHash = termsHashInput || computeTermsHash(terms);
  const summary = await generateContractSummary(terms, neg.deal_type as string, neg.category as string);
  const params = JSON.parse(neg.params as string);

  return createContract({
    negotiation_id: neg.id as string,
    deal_type: neg.deal_type as string,
    terms,
    summary,
    party_a_wallet: neg.party_a_wallet as string,
    party_b_wallet: neg.party_b_wallet as string,
    condition_desc: params.condition,
    condition_data_source: params.data_source,
    resolution_date: params.resolution_date,
    terms_hash: termsHash,
    confirmed_by_a_at: (neg.party_a_done_at as string) || null,
    confirmed_by_b_at: (neg.party_b_done_at as string) || null,
  });
}

export function walkAway(negotiationId: string, walletAddress: string): { status: string } {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!neg) throw notFound('Negotiation not found');
  if (neg.status !== 'active') throw conflict('Negotiation is not active');
  if (walletAddress !== neg.party_a_wallet && walletAddress !== neg.party_b_wallet) {
    throw forbidden('You are not a participant');
  }

  run(`UPDATE negotiations SET status = 'no_deal', updated_at = datetime('now') WHERE id = ?`, [negotiationId]);
  updateReputation(walletAddress, 'walkaway', neg.current_round as number);
  flushDb();

  return { status: 'no_deal' };
}

export function getNegotiationStatus(negotiationId: string, requesterWallet?: string): any {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!neg) throw notFound('Negotiation not found');
  if (
    requesterWallet &&
    requesterWallet !== neg.party_a_wallet &&
    requesterWallet !== neg.party_b_wallet
  ) {
    throw forbidden('You are not a participant in this negotiation');
  }

  const rounds = all(
    'SELECT id, round_number, party, offer_raw, offer_structured, ai_suggestion, created_at FROM rounds WHERE negotiation_id = ? ORDER BY round_number, created_at',
    [negotiationId]
  );

  const requesterParty = requesterWallet
    ? requesterWallet === neg.party_a_wallet
      ? 'A'
      : requesterWallet === neg.party_b_wallet
        ? 'B'
        : null
    : null;

  let privateConstraints: Record<string, any> = {};
  try {
    if (requesterParty === 'A') {
      privateConstraints = JSON.parse((neg.party_a_constraints as string) || '{}');
    } else if (requesterParty === 'B') {
      privateConstraints = JSON.parse((neg.party_b_constraints as string) || '{}');
    }
  } catch {
    privateConstraints = {};
  }

  return {
    id: neg.id,
    deal_type: neg.deal_type,
    category: neg.category,
    params: JSON.parse(neg.params as string),
    status: neg.status,
    max_rounds: neg.max_rounds,
    current_round: neg.current_round,
    party_a_wallet: neg.party_a_wallet,
    party_b_wallet: neg.party_b_wallet,
    final_terms_draft: (() => {
      if (typeof neg.final_terms_draft !== 'string' || !neg.final_terms_draft.trim()) return null;
      try {
        const parsed = JSON.parse(neg.final_terms_draft as string);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    })(),
    final_terms_hash: neg.final_terms_hash || null,
    party_a_confirmed_terms_hash: neg.party_a_confirmed_terms_hash || null,
    party_b_confirmed_terms_hash: neg.party_b_confirmed_terms_hash || null,
    party_a_done_at: neg.party_a_done_at || null,
    party_b_done_at: neg.party_b_done_at || null,
    rounds: rounds.map((r: any) => ({
      ...r,
      offer_raw: r.offer_raw,
      offer_structured: JSON.parse(r.offer_structured as string),
    })),
    requester_party: requesterParty,
    private_constraints: privateConstraints,
    created_at: neg.created_at,
    updated_at: neg.updated_at,
  };
}
