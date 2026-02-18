export type DealType = 'service' | 'conditional';
export type NegotiationStatus = 'waiting' | 'active' | 'deal' | 'impasse' | 'no_deal';
export type ContractStatus = 'active' | 'pending_resolution' | 'resolved';
export type ConditionVerdict = 'TRUE' | 'FALSE' | 'PENDING';
export type EscrowStatus = 'awaiting_funding' | 'funded' | 'released' | 'refunded' | 'failed';
export type SessionMode = 'signature' | 'demo';

export interface AuthChallenge {
  nonce: string;
  message: string;
  expires_at: string;
}

export interface AuthSession {
  token: string;
  wallet_address: string;
  mode: SessionMode;
  expires_at: string;
}

export interface ReputationViewModel {
  wallet_address: string;
  total_negotiations: number;
  deals_completed: number;
  conditional_deals: number;
  avg_rounds: number;
  good_faith_score: number;
  total_reputation: number;
  last_updated: string;
}

export interface RoundViewModel {
  id: string;
  round_number: number;
  party: 'A' | 'B';
  offer_raw?: string | null;
  offer_structured: Record<string, unknown> | string;
  ai_suggestion?: string | null;
  created_at: string;
}

export interface NegotiationViewModel {
  id: string;
  deal_type: DealType;
  category: string;
  params: Record<string, unknown>;
  status: NegotiationStatus;
  max_rounds: number;
  current_round: number;
  party_a_wallet: string;
  party_b_wallet: string | null;
  final_terms_draft?: Record<string, unknown> | null;
  final_terms_hash?: string | null;
  party_a_confirmed_terms_hash?: string | null;
  party_b_confirmed_terms_hash?: string | null;
  party_a_done_at?: string | null;
  party_b_done_at?: string | null;
  rounds: RoundViewModel[];
  requester_party?: 'A' | 'B' | null;
  private_constraints?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ConditionViewModel {
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

export interface ContractViewModel {
  id: string;
  negotiation_id: string;
  deal_type: DealType;
  terms: Record<string, unknown>;
  summary: string;
  party_a_wallet: string;
  party_b_wallet: string;
  status: ContractStatus;
  condition_desc?: string | null;
  condition_data_source?: string | null;
  resolution_date?: string | null;
  verdict?: ConditionVerdict | null;
  verdict_reasoning?: string | null;
  attestation_id?: string | null;
  terms_hash?: string | null;
  confirmed_by_a_at?: string | null;
  confirmed_by_b_at?: string | null;
  escrow?: EscrowViewModel;
  created_at: string;
  resolved_at?: string | null;
  conditions?: ConditionViewModel[];
}

export interface EscrowViewModel {
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

export interface AttestationRecord {
  id: string;
  contract_id: string;
  type: string;
  data_hash: string;
  tee_signature: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AttestationVerification {
  valid: boolean;
  attestation: AttestationRecord;
}

export interface NegotiationSummary {
  id: string;
  deal_type: DealType;
  category: string;
  status: NegotiationStatus;
  party_a_wallet: string;
  party_b_wallet?: string;
}

export interface CreateNegotiationResponse {
  room_id: string;
  negotiation: NegotiationSummary;
}

export interface JoinNegotiationResponse {
  negotiation: NegotiationSummary;
}

export interface NegotiationSuggestion {
  suggestion: string;
  suggested_terms: Record<string, unknown>;
}

export interface SubmitOfferResponse {
  round: RoundViewModel;
  suggestion?: NegotiationSuggestion;
  negotiation_status: NegotiationStatus;
  contract?: ContractViewModel;
}

export interface CompleteNegotiationDealResponse {
  status: 'deal';
  contract: ContractViewModel;
}

export interface CompleteNegotiationPendingResponse {
  status: 'awaiting_other_party_confirmation';
  negotiation_id: string;
  terms_hash: string;
  terms_draft: Record<string, unknown>;
  confirmed_by_party: 'A' | 'B';
}

export type CompleteNegotiationResponse = CompleteNegotiationPendingResponse | CompleteNegotiationDealResponse;

export interface ResolveConditionResponse {
  contract_id: string;
  verdict: ConditionVerdict;
  confidence: number;
  reasoning: string;
  external_data: Record<string, unknown>;
  attestation: AttestationRecord;
}

export interface AffirmServiceResponse {
  contract_id: string;
  verdict: 'TRUE';
  reasoning: string;
  receiver_wallet: string;
  provider_wallet: string;
  attestation: AttestationRecord;
}

export interface CreateNegotiationPayload {
  deal_type: DealType;
  category: string;
  params: Record<string, unknown>;
  constraints: Record<string, unknown>;
  wallet_address?: string;
}

export interface JoinNegotiationPayload {
  room_id: string;
  constraints: Record<string, unknown>;
  wallet_address?: string;
}

export interface SubmitOfferPayload {
  negotiation_id: string;
  offer: string | Record<string, unknown>;
  structured?: boolean;
  wallet_address?: string;
}

export interface CompleteNegotiationPayload {
  negotiation_id: string;
  terms_hash?: string;
  escrow_amount_eth: string;
  timeline?: string;
  deliverables?: string;
  notes?: string;
  wallet_address?: string;
}

export interface EscrowPrepareResponse {
  escrow: EscrowViewModel;
  fund_tx: {
    to: string;
    value_wei: string;
    data: string;
  };
}

export interface EscrowFundedResponse {
  escrow: EscrowViewModel;
  attestation: AttestationRecord;
}
