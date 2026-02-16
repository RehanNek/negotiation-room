export type DealType = 'service' | 'conditional';
export type NegotiationStatus = 'waiting' | 'active' | 'deal' | 'impasse' | 'no_deal';
export type ContractStatus = 'active' | 'pending_resolution' | 'resolved';
export type ConditionVerdict = 'TRUE' | 'FALSE' | 'PENDING';
export type PartyRole = 'A' | 'B';

export interface Negotiation {
  id: string;
  deal_type: DealType;
  category: string;
  params: Record<string, any>;
  status: NegotiationStatus;
  max_rounds: number;
  current_round: number;
  party_a_wallet: string;
  party_b_wallet: string | null;
  party_a_constraints: Record<string, any>;
  party_b_constraints: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  negotiation_id: string;
  round_number: number;
  party: PartyRole;
  offer_raw: string;
  offer_structured: Record<string, any>;
  ai_suggestion: string | null;
  created_at: string;
}

export interface Contract {
  id: string;
  negotiation_id: string;
  deal_type: DealType;
  terms: Record<string, any>;
  summary: string;
  party_a_wallet: string;
  party_b_wallet: string;
  status: ContractStatus;
  condition?: string;
  condition_data_source?: string;
  resolution_date?: string;
  verdict?: ConditionVerdict;
  verdict_reasoning?: string;
  attestation_id?: string;
  created_at: string;
  resolved_at?: string;
}

export interface Condition {
  id: string;
  contract_id: string;
  description: string;
  data_source: string;
  threshold: string;
  resolution_date: string;
  verdict: ConditionVerdict;
  evidence: string | null;
  reasoning: string | null;
  checked_at: string | null;
}

export interface Reputation {
  wallet_address: string;
  total_negotiations: number;
  deals_completed: number;
  conditional_deals: number;
  avg_rounds: number;
  good_faith_score: number;
  total_reputation: number;
  last_updated: string;
}

export interface Attestation {
  id: string;
  contract_id: string;
  type: string;
  data_hash: string;
  tee_signature: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface CreateNegotiationRequest {
  deal_type: DealType;
  category: string;
  params: Record<string, any>;
  wallet_address: string;
  constraints: Record<string, any>;
}

export interface JoinNegotiationRequest {
  room_id: string;
  wallet_address: string;
  constraints: Record<string, any>;
}

export interface SubmitOfferRequest {
  negotiation_id: string;
  wallet_address: string;
  offer: string | Record<string, any>;
  structured?: boolean;
}

export interface ResolveConditionRequest {
  wallet_address: string;
}
