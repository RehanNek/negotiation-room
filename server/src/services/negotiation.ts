import { v4 as uuidv4 } from 'uuid';
import { run, get, all, flushDb } from '../db';
import { parseOfferToStructured, generateSuggestion, generateContractSummary } from './ai';
import { createContract, getContract } from './contract';
import { updateReputation } from './reputation';
import { conflict, forbidden, notFound } from '../errors';
import { isDemoModeEnabled } from './auth';
import type { CreateNegotiationRequest, JoinNegotiationRequest, SubmitOfferRequest } from '../types';

interface FinalRoundSnapshot {
  party: string;
  offer_structured: Record<string, any>;
  offer_raw?: string;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function buildFinalTerms(rounds: FinalRoundSnapshot[]): Record<string, any> {
  const lastA = [...rounds].reverse().find((round) => round.party === 'A');
  const lastB = [...rounds].reverse().find((round) => round.party === 'B');

  if (!lastA && !lastB) return {};

  if (lastA && !lastB) {
    return {
      agreed_terms: lastA.offer_structured,
      party_a_offer: lastA.offer_structured,
      party_a_message: lastA.offer_raw || null,
    };
  }

  if (!lastA && lastB) {
    return {
      agreed_terms: lastB.offer_structured,
      party_b_offer: lastB.offer_structured,
      party_b_message: lastB.offer_raw || null,
    };
  }

  const shared: Record<string, any> = {};
  const keys = new Set<string>([
    ...Object.keys(lastA?.offer_structured || {}),
    ...Object.keys(lastB?.offer_structured || {}),
  ]);

  for (const key of keys) {
    const aValue = lastA?.offer_structured?.[key];
    const bValue = lastB?.offer_structured?.[key];
    if (aValue !== undefined && bValue !== undefined && areValuesEqual(aValue, bValue)) {
      shared[key] = aValue;
    }
  }

  const terms: Record<string, any> = {
    party_a_offer: lastA?.offer_structured || {},
    party_b_offer: lastB?.offer_structured || {},
    party_a_message: lastA?.offer_raw || null,
    party_b_message: lastB?.offer_raw || null,
  };

  if (Object.keys(shared).length > 0) {
    terms.agreed_terms = shared;
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
  run(`UPDATE negotiations SET current_round = ?, updated_at = datetime('now') WHERE id = ?`, [messageIndex, req.negotiation_id]);

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

export async function finalizeNegotiationDeal(negotiationId: string, walletAddress: string): Promise<{
  status: 'deal';
  contract: any;
}> {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!neg) throw notFound('Negotiation not found');
  if (walletAddress !== neg.party_a_wallet && walletAddress !== neg.party_b_wallet) {
    throw forbidden('You are not a participant in this negotiation');
  }

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

  run(`UPDATE negotiations SET status = 'deal', updated_at = datetime('now') WHERE id = ?`, [negotiationId]);
  const contract = await finalizeContract(neg, rounds);
  updateReputation(neg.party_a_wallet as string, 'deal', rounds.length);
  updateReputation(neg.party_b_wallet as string, 'deal', rounds.length);
  flushDb();

  return { status: 'deal', contract };
}

async function finalizeContract(neg: any, rounds: FinalRoundSnapshot[]): Promise<any> {
  const terms = buildFinalTerms(rounds);

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
