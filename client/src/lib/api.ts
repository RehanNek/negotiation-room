const API_BASE = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? '/api'
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API request failed');
  }
  return res.json();
}

export const api = {
  health: () => request('/health'),

  // Negotiation
  createNegotiation: (data: {
    deal_type: string;
    category: string;
    params: Record<string, any>;
    wallet_address: string;
    constraints: Record<string, any>;
  }) => request('/negotiate/create', { method: 'POST', body: JSON.stringify(data) }),

  joinNegotiation: (data: {
    room_id: string;
    wallet_address: string;
    constraints: Record<string, any>;
  }) => request('/negotiate/join', { method: 'POST', body: JSON.stringify(data) }),

  submitOffer: (data: {
    negotiation_id: string;
    wallet_address: string;
    offer: string | Record<string, any>;
    structured?: boolean;
  }) => request('/negotiate/offer', { method: 'POST', body: JSON.stringify(data) }),

  walkAway: (data: {
    negotiation_id: string;
    wallet_address: string;
  }) => request('/negotiate/walkaway', { method: 'POST', body: JSON.stringify(data) }),

  getNegotiationStatus: (id: string) => request(`/negotiate/status/${id}`),

  // Contracts
  getContract: (id: string) => request(`/contract/${id}`),
  getContractsByWallet: (wallet: string) => request(`/contract/wallet/${wallet}`),
  resolveCondition: (id: string) => request(`/contract/${id}/resolve`, { method: 'POST' }),

  // Reputation
  getReputation: (wallet: string) => request(`/reputation/${wallet}`),
  getLeaderboard: (limit?: number) => request(`/reputation/leaderboard?limit=${limit || 10}`),

  // Attestation
  getAttestation: (id: string) => request(`/attestation/${id}`),
  verifyAttestation: (id: string) => request(`/attestation/${id}/verify`),
};
