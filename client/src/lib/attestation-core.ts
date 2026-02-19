import { canonicalize } from 'json-canonicalize';
import {
  recoverTypedDataAddress,
  sha256,
  stringToBytes,
  verifyTypedData,
  type Hex,
} from 'viem';
import type {
  AttestationRecord,
  AttestationSignatureDomain,
  AttestationSignatureMessage,
  AttestationSignatureTypes,
} from './types';

export const ATTESTATION_HASH_ALGO = 'sha256-rfc8785';
export const ATTESTATION_SIG_TYPE = 'eip712';
export const ROOM_ATTESTATION_PRIMARY_TYPE = 'RoomAttestation';
export const ROOM_ATTESTATION_TYPES: AttestationSignatureTypes = {
  RoomAttestation: [
    { name: 'attestationId', type: 'string' },
    { name: 'contractId', type: 'string' },
    { name: 'attestationType', type: 'string' },
    { name: 'dataHash', type: 'string' },
    { name: 'createdAt', type: 'string' },
  ],
};

export interface LocalAttestationVerification {
  valid: boolean;
  computed_data_hash: string;
  expected_data_hash: string;
  recovered_signer: string | null;
  reason?: string;
}

function normalizeHash(value: string): string {
  return value.toLowerCase().replace(/^0x/, '');
}

function toHexSignature(signature: string): Hex {
  return (signature.startsWith('0x') ? signature : `0x${signature}`) as Hex;
}

function parseDomain(value: unknown): AttestationSignatureDomain | null {
  if (!value || typeof value !== 'object') return null;
  const domain = value as Record<string, unknown>;
  if (typeof domain.name !== 'string' || typeof domain.version !== 'string') return null;
  const chainRaw = domain.chainId;
  const chainId = typeof chainRaw === 'number' ? chainRaw : Number.parseInt(String(chainRaw || ''), 10);
  if (!Number.isFinite(chainId)) return null;
  return {
    name: domain.name,
    version: domain.version,
    chainId,
  };
}

function parseMessage(value: unknown): AttestationSignatureMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (typeof message.attestationId !== 'string') return null;
  if (typeof message.contractId !== 'string') return null;
  if (typeof message.attestationType !== 'string') return null;
  if (typeof message.dataHash !== 'string') return null;
  if (typeof message.createdAt !== 'string') return null;
  return {
    attestationId: message.attestationId,
    contractId: message.contractId,
    attestationType: message.attestationType,
    dataHash: message.dataHash,
    createdAt: message.createdAt,
  };
}

export function canonicalizeAttestationPayload(payload: Record<string, unknown>): string {
  return canonicalize(payload);
}

export function computeCanonicalPayloadHash(payload: Record<string, unknown>): string {
  const canonicalPayload = canonicalizeAttestationPayload(payload);
  return normalizeHash(sha256(stringToBytes(canonicalPayload)));
}

export function buildAttestationDomain(chainId: number = 11155111): AttestationSignatureDomain {
  return {
    name: 'NegotiationRoomAttestation',
    version: '1',
    chainId,
  };
}

export function buildAttestationMessage(record: Pick<
  AttestationRecord,
  'id' | 'contract_id' | 'type' | 'data_hash' | 'created_at'
>): AttestationSignatureMessage {
  return {
    attestationId: record.id,
    contractId: record.contract_id,
    attestationType: record.type,
    dataHash: normalizeHash(record.data_hash),
    createdAt: record.created_at,
  };
}

export async function verifyAttestationRecord(record: AttestationRecord): Promise<LocalAttestationVerification> {
  const computedDataHash = computeCanonicalPayloadHash(record.payload);
  const expectedDataHash = normalizeHash(record.data_hash);
  if (computedDataHash !== expectedDataHash) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Payload hash mismatch',
    };
  }

  if (record.hash_algo && record.hash_algo !== ATTESTATION_HASH_ALGO) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: `Unsupported hash algorithm: ${record.hash_algo}`,
    };
  }

  const sigType = record.sig_type || (record.signature ? ATTESTATION_SIG_TYPE : null);
  if (sigType !== ATTESTATION_SIG_TYPE) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Unsupported signature type',
    };
  }

  if (!record.signer_wallet) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Missing signer_wallet',
    };
  }

  const signatureValue = record.signature || record.tee_signature;
  if (!signatureValue) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Missing signature',
    };
  }

  const domain = parseDomain(record.sig_domain) || buildAttestationDomain();
  const message = parseMessage(record.sig_message) || buildAttestationMessage(record);
  const messageHash = normalizeHash(message.dataHash);
  if (messageHash !== expectedDataHash) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Signature message hash mismatch',
    };
  }

  const signature = toHexSignature(signatureValue);
  const typedData = {
    domain,
    types: (record.sig_types || ROOM_ATTESTATION_TYPES) as AttestationSignatureTypes,
    primaryType: ROOM_ATTESTATION_PRIMARY_TYPE,
    message: {
      ...message,
      dataHash: expectedDataHash,
    },
  } as const;

  let recovered: string | null = null;
  try {
    recovered = await recoverTypedDataAddress({ ...typedData, signature } as any);
  } catch {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: null,
      reason: 'Unable to recover signer',
    };
  }

  const recoveredMatches = recovered.toLowerCase() === record.signer_wallet.toLowerCase();
  if (!recoveredMatches) {
    return {
      valid: false,
      computed_data_hash: computedDataHash,
      expected_data_hash: expectedDataHash,
      recovered_signer: recovered,
      reason: 'Recovered signer does not match signer_wallet',
    };
  }

  let validSignature = false;
  try {
    validSignature = await verifyTypedData({
      ...typedData,
      address: record.signer_wallet as `0x${string}`,
      signature,
    } as any);
  } catch {
    validSignature = false;
  }

  return {
    valid: validSignature,
    computed_data_hash: computedDataHash,
    expected_data_hash: expectedDataHash,
    recovered_signer: recovered,
    reason: validSignature ? undefined : 'Signature verification failed',
  };
}
