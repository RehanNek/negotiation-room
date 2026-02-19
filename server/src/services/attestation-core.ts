import { canonicalize } from 'json-canonicalize';
import {
  recoverTypedDataAddress,
  sha256,
  stringToBytes,
  verifyTypedData,
  type Hex,
} from 'viem';

export const ATTESTATION_HASH_ALGO = 'sha256-rfc8785';
export const ATTESTATION_SIG_TYPE = 'eip712';
export const ROOM_ATTESTATION_PRIMARY_TYPE = 'RoomAttestation';
export const ROOM_ATTESTATION_TYPES = {
  RoomAttestation: [
    { name: 'attestationId', type: 'string' },
    { name: 'contractId', type: 'string' },
    { name: 'attestationType', type: 'string' },
    { name: 'dataHash', type: 'string' },
    { name: 'createdAt', type: 'string' },
  ],
} as const;

export interface RoomAttestationDomain {
  name: string;
  version: string;
  chainId: number;
}

export interface RoomAttestationMessage {
  attestationId: string;
  contractId: string;
  attestationType: string;
  dataHash: string;
  createdAt: string;
}

export interface SignedAttestationVerificationResult {
  valid: boolean;
  computed_data_hash: string;
  recovered_signer: string | null;
  reason?: string;
}

function toHexSignature(signature: string): Hex {
  return (signature.startsWith('0x') ? signature : `0x${signature}`) as Hex;
}

function normalizeHash(value: string): string {
  return value.toLowerCase().replace(/^0x/, '');
}

export function getAttestationChainId(): number {
  const parsed = Number.parseInt(process.env.ESCROW_CHAIN_ID || '11155111', 10);
  return Number.isFinite(parsed) ? parsed : 11155111;
}

export function canonicalizeAttestationPayload(payload: Record<string, unknown>): string {
  return canonicalize(payload);
}

export function computeCanonicalPayloadHash(payload: Record<string, unknown>): string {
  const canonicalPayload = canonicalizeAttestationPayload(payload);
  const hexDigest = sha256(stringToBytes(canonicalPayload));
  return normalizeHash(hexDigest);
}

export function buildAttestationDomain(chainId: number = getAttestationChainId()): RoomAttestationDomain {
  return {
    name: 'NegotiationRoomAttestation',
    version: '1',
    chainId,
  };
}

export function buildAttestationMessage(input: {
  attestationId: string;
  contractId: string;
  attestationType: string;
  dataHash: string;
  createdAt: string;
}): RoomAttestationMessage {
  return {
    attestationId: input.attestationId,
    contractId: input.contractId,
    attestationType: input.attestationType,
    dataHash: normalizeHash(input.dataHash),
    createdAt: input.createdAt,
  };
}

export function buildAttestationTypedData(input: {
  domain: RoomAttestationDomain;
  message: RoomAttestationMessage;
}) {
  return {
    domain: input.domain,
    types: ROOM_ATTESTATION_TYPES,
    primaryType: ROOM_ATTESTATION_PRIMARY_TYPE,
    message: input.message,
  } as const;
}

export async function verifySignedAttestation(input: {
  payload: Record<string, unknown>;
  dataHash: string;
  signature: string;
  signerWallet: string;
  domain: RoomAttestationDomain;
  message: RoomAttestationMessage;
}): Promise<SignedAttestationVerificationResult> {
  const computedHash = computeCanonicalPayloadHash(input.payload);
  const attestationHash = normalizeHash(input.dataHash);
  const messageHash = normalizeHash(input.message.dataHash);
  if (computedHash !== attestationHash || computedHash !== messageHash) {
    return {
      valid: false,
      computed_data_hash: computedHash,
      recovered_signer: null,
      reason: 'Payload hash mismatch',
    };
  }

  const typedData = buildAttestationTypedData({
    domain: input.domain,
    message: { ...input.message, dataHash: computedHash },
  });

  const signature = toHexSignature(input.signature);
  let recovered: string | null = null;
  try {
    recovered = await recoverTypedDataAddress({ ...typedData, signature });
  } catch {
    return {
      valid: false,
      computed_data_hash: computedHash,
      recovered_signer: null,
      reason: 'Unable to recover signer',
    };
  }

  const signerMatches = recovered.toLowerCase() === input.signerWallet.toLowerCase();
  if (!signerMatches) {
    return {
      valid: false,
      computed_data_hash: computedHash,
      recovered_signer: recovered,
      reason: 'Recovered signer does not match signer_wallet',
    };
  }

  let signatureValid = false;
  try {
    signatureValid = await verifyTypedData({
      ...typedData,
      address: input.signerWallet as `0x${string}`,
      signature,
    });
  } catch {
    signatureValid = false;
  }

  return {
    valid: signatureValid,
    computed_data_hash: computedHash,
    recovered_signer: recovered,
    reason: signatureValid ? undefined : 'Signature verification failed',
  };
}
