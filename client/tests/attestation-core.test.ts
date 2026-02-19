import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  buildAttestationDomain,
  buildAttestationMessage,
  canonicalizeAttestationPayload,
  computeCanonicalPayloadHash,
  verifyAttestationRecord,
} from '@/lib/attestation-core';
import type { AttestationRecord } from '@/lib/types';

async function makeSignedAttestationRecord(): Promise<AttestationRecord> {
  const signer = privateKeyToAccount(
    '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
  );
  const payload = {
    contract_id: 'contract-1',
    action: 'service_delivery_affirmed',
    verdict: 'TRUE',
  };
  const createdAt = '2026-02-18T00:00:00.000Z';
  const dataHash = computeCanonicalPayloadHash(payload);
  const domain = buildAttestationDomain(11155111);
  const message = buildAttestationMessage({
    id: 'attestation-1',
    contract_id: 'contract-1',
    type: 'service_affirmation',
    data_hash: dataHash,
    created_at: createdAt,
    tee_signature: '',
    payload,
  });
  const signature = await signer.signTypedData({
    domain,
    types: {
      RoomAttestation: [
        { name: 'attestationId', type: 'string' },
        { name: 'contractId', type: 'string' },
        { name: 'attestationType', type: 'string' },
        { name: 'dataHash', type: 'string' },
        { name: 'createdAt', type: 'string' },
      ],
    },
    primaryType: 'RoomAttestation',
    message,
  });

  return {
    id: 'attestation-1',
    contract_id: 'contract-1',
    type: 'service_affirmation',
    data_hash: dataHash,
    tee_signature: signature,
    signature,
    sig_type: 'eip712',
    signer_wallet: signer.address,
    sig_domain: domain,
    sig_types: {
      RoomAttestation: [
        { name: 'attestationId', type: 'string' },
        { name: 'contractId', type: 'string' },
        { name: 'attestationType', type: 'string' },
        { name: 'dataHash', type: 'string' },
        { name: 'createdAt', type: 'string' },
      ],
    },
    sig_message: message,
    hash_algo: 'sha256-rfc8785',
    payload,
    created_at: createdAt,
  };
}

describe('attestation-core', () => {
  it('canonicalizes payloads deterministically', () => {
    const left = canonicalizeAttestationPayload({
      b: 2,
      a: 1,
      nested: { z: true, y: 'hello', x: [1, 2, 3] },
    });
    const right = canonicalizeAttestationPayload({
      nested: { x: [1, 2, 3], y: 'hello', z: true },
      a: 1,
      b: 2,
    });
    expect(left).toBe(right);
    expect(computeCanonicalPayloadHash(JSON.parse(left) as Record<string, unknown>)).toHaveLength(64);
  });

  it('verifies signed attestations locally in browser code', async () => {
    const record = await makeSignedAttestationRecord();
    const verification = await verifyAttestationRecord(record);
    expect(verification.valid).toBe(true);
    expect(verification.recovered_signer?.toLowerCase()).toBe(record.signer_wallet?.toLowerCase());
  });

  it('fails verification when payload or signature is tampered', async () => {
    const record = await makeSignedAttestationRecord();

    const tamperedPayload = await verifyAttestationRecord({
      ...record,
      payload: { ...record.payload, verdict: 'FALSE' },
    });
    expect(tamperedPayload.valid).toBe(false);

    const tamperedSignature = await verifyAttestationRecord({
      ...record,
      signature: `0x${'0'.repeat(130)}`,
      tee_signature: `0x${'0'.repeat(130)}`,
    });
    expect(tamperedSignature.valid).toBe(false);
  });
});
