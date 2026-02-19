import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  ATTESTATION_SIG_TYPE,
  buildAttestationDomain,
  buildAttestationMessage,
  buildAttestationTypedData,
  computeCanonicalPayloadHash,
  verifySignedAttestation,
} from '../src/services/attestation-core';

describe('attestation-core', () => {
  it('produces deterministic canonical payload hashes', () => {
    const left = {
      b: 2,
      a: 1,
      nested: {
        z: true,
        y: 'hello',
        x: [3, 2, 1],
      },
    };

    const right = {
      nested: {
        x: [3, 2, 1],
        y: 'hello',
        z: true,
      },
      a: 1,
      b: 2,
    };

    const leftHash = computeCanonicalPayloadHash(left);
    const rightHash = computeCanonicalPayloadHash(right);
    expect(leftHash).toHaveLength(64);
    expect(leftHash).toBe(rightHash);
  });

  it('verifies EIP-712 attestation signatures end-to-end', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
    );
    const payload = {
      contract_id: 'contract-1',
      action: 'service_delivery_affirmed',
      verdict: 'TRUE',
    };
    const dataHash = computeCanonicalPayloadHash(payload);
    const domain = buildAttestationDomain(11155111);
    const message = buildAttestationMessage({
      attestationId: 'attest-1',
      contractId: 'contract-1',
      attestationType: 'service_affirmation',
      dataHash,
      createdAt: '2026-02-18T00:00:00.000Z',
    });
    const signature = await account.signTypedData(buildAttestationTypedData({ domain, message }));

    const result = await verifySignedAttestation({
      payload,
      dataHash,
      signature,
      signerWallet: account.address,
      domain,
      message,
    });

    expect(ATTESTATION_SIG_TYPE).toBe('eip712');
    expect(result.valid).toBe(true);
    expect(result.recovered_signer?.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('fails verification when payload is tampered', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
    );
    const originalPayload = {
      contract_id: 'contract-2',
      verdict: 'TRUE',
    };
    const dataHash = computeCanonicalPayloadHash(originalPayload);
    const domain = buildAttestationDomain(11155111);
    const message = buildAttestationMessage({
      attestationId: 'attest-2',
      contractId: 'contract-2',
      attestationType: 'condition_resolution',
      dataHash,
      createdAt: '2026-02-18T00:00:00.000Z',
    });
    const signature = await account.signTypedData(buildAttestationTypedData({ domain, message }));

    const tampered = await verifySignedAttestation({
      payload: { ...originalPayload, verdict: 'FALSE' },
      dataHash,
      signature,
      signerWallet: account.address,
      domain,
      message,
    });

    expect(tampered.valid).toBe(false);
    expect(tampered.reason).toContain('hash');
  });

  it('fails verification when signer does not match', async () => {
    const signer = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
    );
    const wrongSigner = privateKeyToAccount(
      '0x8b3a350cf5c34c9194ca1f9f2d5df553f136f2f490128bb0c2fce0f3c5f8f6f6'
    );
    const payload = {
      contract_id: 'contract-3',
      verdict: 'TRUE',
    };
    const dataHash = computeCanonicalPayloadHash(payload);
    const domain = buildAttestationDomain(11155111);
    const message = buildAttestationMessage({
      attestationId: 'attest-3',
      contractId: 'contract-3',
      attestationType: 'deal_recorded',
      dataHash,
      createdAt: '2026-02-18T00:00:00.000Z',
    });
    const signature = await signer.signTypedData(buildAttestationTypedData({ domain, message }));

    const verified = await verifySignedAttestation({
      payload,
      dataHash,
      signature,
      signerWallet: wrongSigner.address,
      domain,
      message,
    });

    expect(verified.valid).toBe(false);
    expect(verified.reason).toContain('signer');
  });
});
