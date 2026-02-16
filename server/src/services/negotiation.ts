import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../db';
import { parseOfferToStructured, generateSuggestion, analyzeConvergence, generateContractSummary } from './ai';
import { createContract } from './contract';
import { updateReputation } from './reputation';
import type { CreateNegotiationRequest, JoinNegotiationRequest, SubmitOfferRequest } from '../types';

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
  if (!neg) throw new Error('Room not found');
  if (neg.status !== 'waiting') throw new Error('Room is not accepting new participants');
  // Allow same wallet in demo/hackathon mode for testing
  // if (neg.party_a_wallet === req.wallet_address) throw new Error('Cannot join your own room');

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
  if (!neg) throw new Error('Negotiation not found');
  if (neg.status !== 'active') throw new Error('Negotiation is not active');

  const existingRounds = all(
    'SELECT * FROM rounds WHERE negotiation_id = ? ORDER BY round_number, created_at',
    [req.negotiation_id]
  );

  const currentRoundNumber = (neg.current_round as number) + 1;
  const currentRoundOffers = existingRounds.filter((r: any) => r.round_number === currentRoundNumber);

  let party: 'A' | 'B';
  if (neg.party_a_wallet === neg.party_b_wallet) {
    // Demo mode: same wallet is both parties — auto-alternate
    const aSubmitted = currentRoundOffers.some((r: any) => r.party === 'A');
    party = aSubmitted ? 'B' : 'A';
  } else if (req.wallet_address === neg.party_a_wallet) {
    party = 'A';
  } else if (req.wallet_address === neg.party_b_wallet) {
    party = 'B';
  } else {
    throw new Error('You are not a participant in this negotiation');
  }

  const alreadySubmitted = currentRoundOffers.some((r: any) => r.party === party);
  if (alreadySubmitted) throw new Error('You already submitted an offer for this round');

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
  const allRounds = existingRounds.map((r: any) => ({
    party: r.party as string,
    offer_structured: JSON.parse(r.offer_structured as string),
  }));

  const suggestion = await generateSuggestion(
    neg.category as string,
    JSON.parse(neg.params as string),
    allRounds,
    party,
    constraints
  );

  const roundId = uuidv4();
  run(
    `INSERT INTO rounds (id, negotiation_id, round_number, party, offer_raw, offer_structured, ai_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [roundId, req.negotiation_id, currentRoundNumber, party, offerRaw, JSON.stringify(offerStructured), suggestion.suggestion]
  );

  const updatedRoundOffers = currentRoundOffers.length + 1;
  if (updatedRoundOffers >= 2) {
    run(`UPDATE negotiations SET current_round = ?, updated_at = datetime('now') WHERE id = ?`, [currentRoundNumber, req.negotiation_id]);

    const allRoundsNow = [...allRounds, { party, offer_structured: offerStructured }];
    const convergence = await analyzeConvergence(allRoundsNow);

    if (convergence.converging && convergence.gap_percentage < 20) {
      run(`UPDATE negotiations SET status = 'deal', updated_at = datetime('now') WHERE id = ?`, [req.negotiation_id]);

      const contract = await finalizeContract(neg, allRoundsNow);
      updateReputation(neg.party_a_wallet as string, 'deal', currentRoundNumber);
      updateReputation(neg.party_b_wallet as string, 'deal', currentRoundNumber);

      return {
        round: { id: roundId, round_number: currentRoundNumber, party, offer_structured: offerStructured },
        suggestion,
        negotiation_status: 'deal',
        contract,
      };
    }

    if (currentRoundNumber >= (neg.max_rounds as number)) {
      run(`UPDATE negotiations SET status = 'impasse', updated_at = datetime('now') WHERE id = ?`, [req.negotiation_id]);
      updateReputation(neg.party_a_wallet as string, 'impasse', currentRoundNumber);
      updateReputation(neg.party_b_wallet as string, 'impasse', currentRoundNumber);

      return {
        round: { id: roundId, round_number: currentRoundNumber, party, offer_structured: offerStructured },
        suggestion,
        negotiation_status: 'impasse',
      };
    }
  }

  return {
    round: { id: roundId, round_number: currentRoundNumber, party, offer_structured: offerStructured },
    suggestion,
    negotiation_status: 'active',
  };
}

async function finalizeContract(neg: any, rounds: Array<{ party: string; offer_structured: Record<string, any> }>): Promise<any> {
  const lastA = [...rounds].reverse().find((r) => r.party === 'A');
  const lastB = [...rounds].reverse().find((r) => r.party === 'B');
  const terms = { ...lastA?.offer_structured, ...lastB?.offer_structured };

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
  if (!neg) throw new Error('Negotiation not found');
  if (neg.status !== 'active') throw new Error('Negotiation is not active');
  if (walletAddress !== neg.party_a_wallet && walletAddress !== neg.party_b_wallet) {
    throw new Error('You are not a participant');
  }

  run(`UPDATE negotiations SET status = 'no_deal', updated_at = datetime('now') WHERE id = ?`, [negotiationId]);
  updateReputation(walletAddress, 'walkaway', neg.current_round as number);

  return { status: 'no_deal' };
}

export function getNegotiationStatus(negotiationId: string): any {
  const neg = get('SELECT * FROM negotiations WHERE id = ?', [negotiationId]);
  if (!neg) throw new Error('Negotiation not found');

  const rounds = all(
    'SELECT id, round_number, party, offer_structured, ai_suggestion, created_at FROM rounds WHERE negotiation_id = ? ORDER BY round_number, created_at',
    [negotiationId]
  );

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
      offer_structured: JSON.parse(r.offer_structured as string),
    })),
    created_at: neg.created_at,
    updated_at: neg.updated_at,
  };
}
