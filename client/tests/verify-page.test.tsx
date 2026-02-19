import { render, screen, waitFor } from '@testing-library/react';
import { privateKeyToAccount } from 'viem/accounts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyPage from '@/app/verify/page';
import { buildAttestationDomain, buildAttestationMessage, computeCanonicalPayloadHash } from '@/lib/attestation-core';
import { api } from '@/lib/api';
import type { AttestationRecord } from '@/lib/types';

let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@/lib/api', () => ({
  api: {
    getAttestation: vi.fn(),
    getContract: vi.fn(),
  },
}));

const mockedApi = api as {
  getAttestation: ReturnType<typeof vi.fn>;
  getContract: ReturnType<typeof vi.fn>;
};

async function makeSignedRecord(): Promise<AttestationRecord> {
  const signer = privateKeyToAccount(
    '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
  );
  const payload = {
    contract_id: 'contract-123',
    action: 'service_delivery_affirmed',
    verdict: 'TRUE',
  };
  const dataHash = computeCanonicalPayloadHash(payload);
  const createdAt = '2026-02-18T00:00:00.000Z';
  const domain = buildAttestationDomain(11155111);
  const message = buildAttestationMessage({
    id: 'attest-123',
    contract_id: 'contract-123',
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
    id: 'attest-123',
    contract_id: 'contract-123',
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

describe('Verify page', () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
    mockedApi.getAttestation.mockReset();
    mockedApi.getContract.mockReset();
  });

  it('renders proof valid from browser-local verification', async () => {
    currentSearchParams = new URLSearchParams('id=attest-123');
    mockedApi.getAttestation.mockResolvedValue(await makeSignedRecord());

    render(<VerifyPage />);

    await screen.findByText('Proof Valid');
    expect(mockedApi.getAttestation).toHaveBeenCalledWith('attest-123');
  });

  it('renders proof invalid when signature checks fail after contract-id fallback', async () => {
    currentSearchParams = new URLSearchParams('id=contract-123');
    const validRecord = await makeSignedRecord();
    const tamperedRecord: AttestationRecord = {
      ...validRecord,
      payload: { ...validRecord.payload, verdict: 'FALSE' },
    };

    mockedApi.getAttestation
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(tamperedRecord);
    mockedApi.getContract.mockResolvedValue({ id: 'contract-123', attestation_id: 'attest-123' });

    render(<VerifyPage />);

    await screen.findByText('Proof Invalid');
    await waitFor(() => {
      expect(screen.getByText('Loaded from contract id')).toBeInTheDocument();
    });
  });
});
