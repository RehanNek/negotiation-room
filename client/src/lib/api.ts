import type {
  AffirmServiceResponse,
  AttestationRecord,
  AttestationVerification,
  AuthChallenge,
  AuthSession,
  CompleteNegotiationPayload,
  CompleteNegotiationResponse,
  ContractViewModel,
  CreateNegotiationPayload,
  CreateNegotiationResponse,
  JoinNegotiationPayload,
  JoinNegotiationResponse,
  NegotiationViewModel,
  ReputationViewModel,
  ResolveConditionResponse,
  EscrowPrepareResponse,
  EscrowViewModel,
  EscrowFundedResponse,
  SubmitOfferPayload,
  SubmitOfferResponse,
} from './types';

const API_BASE = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? '/api'
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

function readSavedWallet(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const wallet = localStorage.getItem('wallet_address');
  return wallet && wallet.trim() ? wallet : undefined;
}

function withLegacyWallet<T extends object>(payload: T): T & { wallet_address?: string } {
  if ('wallet_address' in payload) return payload as T & { wallet_address?: string };
  const wallet = readSavedWallet();
  if (!wallet) return payload as T & { wallet_address?: string };
  return { ...(payload as object), wallet_address: wallet } as T & { wallet_address?: string };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const parsedBody: unknown = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const apiError =
      parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody
        ? (parsedBody as { error?: unknown }).error
        : undefined;
    const apiCode =
      parsedBody && typeof parsedBody === 'object' && 'code' in parsedBody
        ? (parsedBody as { code?: unknown }).code
        : undefined;

    if (
      res.status === 401 &&
      path !== '/auth/challenge' &&
      path !== '/auth/verify' &&
      typeof window !== 'undefined'
    ) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('wallet_address');
      throw new Error('Session expired. Please reconnect your wallet.');
    }

    if (parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody) {
      throw new Error(typeof apiError === 'string' && apiError ? apiError : 'API request failed');
    }
    if (typeof apiCode === 'string' && apiCode === 'UNAUTHORIZED') {
      throw new Error('Session expired. Please reconnect your wallet.');
    }
    if (typeof parsedBody === 'string' && parsedBody.trim()) {
      throw new Error(parsedBody.trim());
    }
    throw new Error(res.statusText || 'API request failed');
  }

  return parsedBody as T;
}

export const api = {
  health: () => request<{ status: string; service: string; timestamp: string }>('/health'),

  createAuthChallenge: (wallet_address: string) =>
    request<AuthChallenge>('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ wallet_address }),
    }),

  verifyAuthChallenge: (data: { wallet_address: string; nonce: string; signature: string }) =>
    request<AuthSession>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createDemoSession: (wallet_address?: string) =>
    request<AuthSession>('/auth/demo', {
      method: 'POST',
      body: JSON.stringify(wallet_address ? { wallet_address } : {}),
    }),

  me: () => request<{ wallet_address: string; mode: 'signature' | 'demo' }>('/auth/me'),

  createNegotiation: (data: CreateNegotiationPayload) =>
    request<CreateNegotiationResponse>('/negotiate/create', {
      method: 'POST',
      body: JSON.stringify(withLegacyWallet(data)),
    }),

  joinNegotiation: (data: JoinNegotiationPayload) =>
    request<JoinNegotiationResponse>('/negotiate/join', {
      method: 'POST',
      body: JSON.stringify(withLegacyWallet(data)),
    }),

  submitOffer: (data: SubmitOfferPayload) =>
    request<SubmitOfferResponse>('/negotiate/offer', {
      method: 'POST',
      body: JSON.stringify(withLegacyWallet(data)),
    }),

  completeNegotiation: (data: CompleteNegotiationPayload) =>
    request<CompleteNegotiationResponse>('/negotiate/done', {
      method: 'POST',
      body: JSON.stringify(withLegacyWallet(data)),
    }),

  walkAway: (data: { negotiation_id: string; wallet_address?: string }) =>
    request<{ status: string }>('/negotiate/walkaway', {
      method: 'POST',
      body: JSON.stringify(withLegacyWallet(data)),
    }),

  getNegotiationStatus: (id: string) => request<NegotiationViewModel>(`/negotiate/status/${id}`),

  getContract: (id: string) => request<ContractViewModel>(`/contract/${id}`),
  getContractsByWallet: (wallet: string) => request<ContractViewModel[]>(`/contract/wallet/${wallet}`),
  resolveCondition: (id: string) =>
    request<ResolveConditionResponse>(`/contract/${id}/resolve`, { method: 'POST' }),
  affirmServiceDelivery: (id: string) =>
    request<AffirmServiceResponse>(`/contract/${id}/affirm`, { method: 'POST' }),
  prepareEscrow: (id: string) =>
    request<EscrowPrepareResponse>(`/contract/${id}/escrow/prepare`, { method: 'POST' }),
  markEscrowFunded: (id: string, tx_hash: string) =>
    request<EscrowFundedResponse>(`/contract/${id}/escrow/funded`, {
      method: 'POST',
      body: JSON.stringify({ tx_hash }),
    }),
  getEscrow: (id: string) => request<EscrowViewModel>(`/contract/${id}/escrow`),

  getReputation: (wallet: string) => request<ReputationViewModel>(`/reputation/${wallet}`),
  getLeaderboard: (limit?: number) => request<ReputationViewModel[]>(`/reputation/leaderboard?limit=${limit || 10}`),

  getAttestation: (id: string) => request<AttestationRecord>(`/attestation/${id}`),
  verifyAttestation: (id: string) => request<AttestationVerification>(`/attestation/${id}/verify`),
};
