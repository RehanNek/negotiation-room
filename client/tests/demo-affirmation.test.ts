import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDemoAffirmations,
  buildContractSnapshotVerification,
  createDemoAffirmation,
  isMissingAffirmRouteError,
  resolveDemoVerification,
} from '@/lib/demoAffirmation';
import type { ContractViewModel } from '@/lib/types';

const baseContract: ContractViewModel = {
  id: 'contract-123',
  negotiation_id: 'neg-1',
  deal_type: 'service',
  terms: { scope: 'labeling' },
  summary: 'Service contract',
  party_a_wallet: '0xaaa',
  party_b_wallet: '0xbbb',
  status: 'active',
  created_at: '2026-02-16T00:00:00.000Z',
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('demo affirmation helpers', () => {
  it('creates and applies a local demo affirmation overlay', async () => {
    const affirmation = await createDemoAffirmation(baseContract, '0xaaa');
    expect(affirmation.contract_id).toBe(baseContract.id);
    expect(affirmation.attestation.id).toContain('demo-attest-');

    const patched = applyDemoAffirmations([baseContract]);
    expect(patched[0].status).toBe('resolved');
    expect(patched[0].attestation_id).toBe(affirmation.attestation.id);
    expect(patched[0].verdict).toBe('TRUE');
  });

  it('resolves demo verification by attestation id and contract id', async () => {
    const affirmation = await createDemoAffirmation(baseContract, '0xaaa');

    const byAttestation = resolveDemoVerification(affirmation.attestation.id);
    expect(byAttestation?.valid).toBe(true);
    expect(byAttestation?.attestation.contract_id).toBe(baseContract.id);

    const byContract = resolveDemoVerification(baseContract.id);
    expect(byContract?.valid).toBe(true);
    expect(byContract?.attestation.id).toBe(affirmation.attestation.id);
  });

  it('detects missing backend affirm-route errors', () => {
    expect(isMissingAffirmRouteError(new Error('Cannot POST /contract/test/affirm'))).toBe(true);
    expect(isMissingAffirmRouteError(new Error('Unauthorized'))).toBe(false);
  });

  it('builds a deterministic contract snapshot verification payload', async () => {
    const snapshot = await buildContractSnapshotVerification(baseContract);
    expect(snapshot.valid).toBe(true);
    expect(snapshot.attestation.type).toBe('deal_snapshot_demo');
    expect(snapshot.attestation.contract_id).toBe(baseContract.id);
    expect(snapshot.attestation.payload.status).toBe('active');
  });
});
