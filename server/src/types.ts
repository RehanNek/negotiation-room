export type DealType = 'service' | 'conditional';
export type NegotiationStatus = 'waiting' | 'active' | 'deal' | 'impasse' | 'no_deal';
export type ContractStatus = 'active' | 'pending_resolution' | 'resolved';
export type ConditionVerdict = 'TRUE' | 'FALSE' | 'PENDING';
export type EscrowStatus = 'awaiting_funding' | 'funded' | 'released' | 'refunded' | 'failed';
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
  final_terms_draft?: Record<string, any> | null;
  final_terms_hash?: string | null;
  party_a_confirmed_terms_hash?: string | null;
  party_b_confirmed_terms_hash?: string | null;
  party_a_done_at?: string | null;
  party_b_done_at?: string | null;
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
  terms_hash?: string | null;
  confirmed_by_a_at?: string | null;
  confirmed_by_b_at?: string | null;
  escrow?: Escrow;
  created_at: string;
  resolved_at?: string;
}

export interface Escrow {
  id: string;
  contract_id: string;
  deal_hash: string;
  status: EscrowStatus;
  chain_id: number;
  asset: 'ETH';
  amount_wei: string;
  payer_wallet: string;
  recipient_if_true_wallet: string;
  recipient_if_false_wallet: string;
  timeout_at: string;
  contract_address: string;
  fund_tx_hash: string | null;
  fund_block_number: number | null;
  settle_tx_hash: string | null;
  refund_tx_hash: string | null;
  attestation_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
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

export interface FinalizeNegotiationRequest {
  negotiation_id: string;
  wallet_address: string;
  terms_hash?: string;
  escrow_amount_eth?: string;
  timeline?: string;
  deliverables?: string;
  notes?: string;
}

export interface FinalizeNegotiationPendingResult {
  status: 'awaiting_other_party_confirmation';
  negotiation_id: string;
  terms_hash: string;
  terms_draft: Record<string, any>;
  confirmed_by_party: PartyRole;
}

export interface FinalizeNegotiationDealResult {
  status: 'deal';
  contract: Contract;
}

export type FinalizeNegotiationResult = FinalizeNegotiationPendingResult | FinalizeNegotiationDealResult;

export interface EscrowPrepareResult {
  escrow: Escrow;
  fund_tx: {
    to: string;
    value_wei: string;
    data: string;
  };
}

export interface EscrowFundedResult {
  escrow: Escrow;
  attestation: {
    id: string;
    data_hash: string;
    tee_signature: string;
  };
}

export interface ResolveConditionRequest {
  wallet_address: string;
}
