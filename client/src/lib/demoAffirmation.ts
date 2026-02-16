import type {
  AffirmServiceResponse,
  AttestationRecord,
  AttestationVerification,
  ContractViewModel,
} from './types';

const STORAGE_KEY = 'demo_service_affirmations_v1';

type DemoAffirmationStore = Record<string, AffirmServiceResponse>;

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStore(): DemoAffirmationStore {
  if (!hasWindow()) return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as DemoAffirmationStore;
  } catch {
    return {};
  }
  return {};
}

function writeStore(store: DemoAffirmationStore): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Browser fallback for environments without SubtleCrypto.
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return `${(hash >>> 0).toString(16)}`.padStart(8, '0');
}

function makeDemoAttestationId(contractId: string): string {
  const suffix = Date.now().toString(36);
  return `demo-attest-${contractId.slice(0, 8)}-${suffix}`;
}

function makeDemoAttestation(contractId: string, payload: Record<string, unknown>, dataHash: string): AttestationRecord {
  return {
    id: makeDemoAttestationId(contractId),
    contract_id: contractId,
    type: 'service_affirmation_demo',
    data_hash: dataHash,
    tee_signature: `demo-${dataHash.slice(0, 48)}`,
    payload,
    created_at: new Date().toISOString(),
  };
}

export function getDemoAffirmationByContractId(contractId: string): AffirmServiceResponse | null {
  const store = readStore();
  return store[contractId] || null;
}

export function getDemoAffirmationByAttestationId(attestationId: string): AffirmServiceResponse | null {
  const store = readStore();
  const record = Object.values(store).find((item) => item.attestation.id === attestationId);
  return record || null;
}

export async function createDemoAffirmation(contract: ContractViewModel, affirmedBy: string): Promise<AffirmServiceResponse> {
  const receiverWallet = contract.party_a_wallet;
  const providerWallet = contract.party_b_wallet;
  const reasoning = 'Service receiver affirmed completion. Demo escrow release recorded for service provider.';
  const payload: Record<string, unknown> = {
    contract_id: contract.id,
    action: 'service_delivery_affirmed',
    affirmed_by: affirmedBy,
    receiver_wallet: receiverWallet,
    provider_wallet: providerWallet,
    escrow_release: {
      mode: 'demo-local',
      status: 'released',
    },
    resolved_at: new Date().toISOString(),
  };

  const dataHash = await sha256Hex(JSON.stringify(payload));
  const attestation = makeDemoAttestation(contract.id, payload, dataHash);
  const response: AffirmServiceResponse = {
    contract_id: contract.id,
    verdict: 'TRUE',
    reasoning,
    receiver_wallet: receiverWallet,
    provider_wallet: providerWallet,
    attestation,
  };

  const store = readStore();
  store[contract.id] = response;
  writeStore(store);
  return response;
}

export function applyDemoAffirmations(contracts: ContractViewModel[]): ContractViewModel[] {
  const store = readStore();
  if (Object.keys(store).length === 0) return contracts;

  return contracts.map((contract) => {
    if (contract.attestation_id) return contract;
    const demo = store[contract.id];
    if (!demo) return contract;

    return {
      ...contract,
      status: 'resolved',
      verdict: 'TRUE',
      verdict_reasoning: demo.reasoning,
      attestation_id: demo.attestation.id,
      resolved_at: demo.attestation.created_at,
    };
  });
}

export function resolveDemoVerification(input: string): AttestationVerification | null {
  const target = input.trim();
  if (!target) return null;

  const byAttestationId = getDemoAffirmationByAttestationId(target);
  if (byAttestationId) {
    return {
      valid: true,
      attestation: byAttestationId.attestation,
    };
  }

  const byContractId = getDemoAffirmationByContractId(target);
  if (byContractId) {
    return {
      valid: true,
      attestation: byContractId.attestation,
    };
  }

  return null;
}

export function isMissingAffirmRouteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('cannot post /contract') && message.includes('/affirm');
}

export async function buildContractSnapshotVerification(contract: ContractViewModel): Promise<AttestationVerification> {
  const payload: Record<string, unknown> = {
    contract_id: contract.id,
    negotiation_id: contract.negotiation_id,
    deal_type: contract.deal_type,
    status: contract.status,
    party_a_wallet: contract.party_a_wallet,
    party_b_wallet: contract.party_b_wallet,
    terms: contract.terms,
    summary: contract.summary,
    created_at: contract.created_at,
  };

  const dataHash = await sha256Hex(JSON.stringify(payload));
  const attestation: AttestationRecord = {
    id: `demo-deal-${contract.id.slice(0, 8)}-${dataHash.slice(0, 8)}`,
    contract_id: contract.id,
    type: 'deal_snapshot_demo',
    data_hash: dataHash,
    tee_signature: `demo-deal-${dataHash.slice(0, 48)}`,
    payload,
    created_at: contract.created_at,
  };

  return {
    valid: true,
    attestation,
  };
}
