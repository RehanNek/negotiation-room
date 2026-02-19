import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getAddress, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { get, run } from '../db';
import type {
  Attestation,
  AttestationSignatureDomain,
  AttestationSignatureMessage,
  AttestationSignatureTypes,
} from '../types';
import {
  ATTESTATION_HASH_ALGO,
  ATTESTATION_SIG_TYPE,
  ROOM_ATTESTATION_TYPES,
  buildAttestationDomain,
  buildAttestationMessage,
  buildAttestationTypedData,
  canonicalizeAttestationPayload,
  computeCanonicalPayloadHash,
  verifySignedAttestation,
} from './attestation-core';

const FALLBACK_ATTESTATION_SIGNER_KEY = '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1';

function parseJsonObject<T>(input: unknown): T | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') return parsed as T;
  } catch {
    return null;
  }
  return null;
}

function normalizeLegacySignature(rawSignature: unknown, signature: string | null): string {
  if (signature && signature.trim()) return signature;
  return typeof rawSignature === 'string' ? rawSignature : '';
}

function parseAttestationRow(row: Record<string, unknown>): Attestation {
  const payload = parseJsonObject<Record<string, unknown>>(row.payload) || {};
  const signature = typeof row.signature === 'string' && row.signature.trim() ? String(row.signature) : null;
  const teeSignature = normalizeLegacySignature(row.tee_signature, signature);
  const sigDomain = parseJsonObject<AttestationSignatureDomain>(row.sig_domain);
  const sigTypes = parseJsonObject<AttestationSignatureTypes>(row.sig_types);
  const sigMessage = parseJsonObject<AttestationSignatureMessage>(row.sig_message);
  const signerWallet =
    typeof row.signer_wallet === 'string' && row.signer_wallet.trim() ? String(row.signer_wallet) : null;
  const hashAlgo = typeof row.hash_algo === 'string' && row.hash_algo.trim() ? String(row.hash_algo) : null;
  const sigType = typeof row.sig_type === 'string' && row.sig_type.trim() ? String(row.sig_type) : null;

  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    type: String(row.type),
    data_hash: String(row.data_hash),
    tee_signature: teeSignature,
    signature,
    sig_type: sigType,
    signer_wallet: signerWallet,
    sig_domain: sigDomain,
    sig_types: sigTypes,
    sig_message: sigMessage,
    hash_algo: hashAlgo,
    payload,
    created_at: String(row.created_at),
  };
}

function getAttestationSigningPrivateKey(): `0x${string}` {
  const candidate = process.env.ESCROW_VERIFIER_PRIVATE_KEY || process.env.ATTESTATION_VERIFIER_PRIVATE_KEY;
  if (candidate && /^0x[a-fA-F0-9]{64}$/.test(candidate)) {
    return candidate as `0x${string}`;
  }
  return FALLBACK_ATTESTATION_SIGNER_KEY as `0x${string}`;
}

function parseDomain(input: unknown): AttestationSignatureDomain | null {
  if (!input || typeof input !== 'object') return null;
  const domain = input as Record<string, unknown>;
  if (typeof domain.name !== 'string') return null;
  if (typeof domain.version !== 'string') return null;
  const chain = domain.chainId;
  const chainId = typeof chain === 'number' ? chain : Number.parseInt(String(chain || ''), 10);
  if (!Number.isFinite(chainId)) return null;
  return { name: domain.name, version: domain.version, chainId };
}

function parseMessage(input: unknown): AttestationSignatureMessage | null {
  if (!input || typeof input !== 'object') return null;
  const message = input as Record<string, unknown>;
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

function shouldUseEip712(attestation: Attestation): boolean {
  return Boolean(
    attestation.signature &&
      attestation.signer_wallet &&
      attestation.sig_type === ATTESTATION_SIG_TYPE
  );
}

function isLikelyAddress(value: string | null): value is `0x${string}` {
  return Boolean(value && isAddress(value));
}

function verifyLegacyAttestation(attestation: Attestation): boolean {
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(attestation.payload)).digest('hex');
  const expectedSig = crypto
    .createHmac('sha256', process.env.TEE_ATTESTATION_KEY || 'the-room-tee-key')
    .update(`${attestation.id}:${attestation.contract_id}:${expectedHash}`)
    .digest('hex');
  return expectedHash === attestation.data_hash && expectedSig === attestation.tee_signature;
}

export async function createAttestation(
  contractId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<Attestation> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const canonicalPayload = canonicalizeAttestationPayload(payload);
  const dataHash = computeCanonicalPayloadHash(payload);

  const signer = privateKeyToAccount(getAttestationSigningPrivateKey());
  const signerWallet = getAddress(signer.address);
  const domain = buildAttestationDomain();
  const message = buildAttestationMessage({
    attestationId: id,
    contractId,
    attestationType: type,
    dataHash,
    createdAt,
  });
  const typedData = buildAttestationTypedData({ domain, message });
  const signature = await signer.signTypedData(typedData);

  run(
    `INSERT INTO attestations (
      id,
      contract_id,
      type,
      data_hash,
      tee_signature,
      signature,
      sig_type,
      signer_wallet,
      sig_domain,
      sig_types,
      sig_message,
      hash_algo,
      payload,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      contractId,
      type,
      dataHash,
      signature,
      signature,
      ATTESTATION_SIG_TYPE,
      signerWallet,
      JSON.stringify(domain),
      JSON.stringify(ROOM_ATTESTATION_TYPES),
      JSON.stringify(message),
      ATTESTATION_HASH_ALGO,
      canonicalPayload,
      createdAt,
    ]
  );

  return {
    id,
    contract_id: contractId,
    type,
    data_hash: dataHash,
    tee_signature: signature,
    signature,
    sig_type: ATTESTATION_SIG_TYPE,
    signer_wallet: signerWallet,
    sig_domain: domain,
    sig_types: ROOM_ATTESTATION_TYPES,
    sig_message: message,
    hash_algo: ATTESTATION_HASH_ALGO,
    payload: JSON.parse(canonicalPayload) as Record<string, unknown>,
    created_at: createdAt,
  };
}

export function getAttestation(attestationId: string): Attestation | null {
  const row = get('SELECT * FROM attestations WHERE id = ?', [attestationId]) as Record<string, unknown> | null;
  if (!row) return null;
  return parseAttestationRow(row);
}

export async function verifyAttestation(attestationId: string): Promise<{
  valid: boolean;
  attestation: Attestation | null;
  recovered_signer: string | null;
  reason?: string;
}> {
  const attestation = getAttestation(attestationId);
  if (!attestation) {
    return { valid: false, attestation: null, recovered_signer: null, reason: 'Attestation not found' };
  }

  if (!shouldUseEip712(attestation)) {
    const valid = verifyLegacyAttestation(attestation);
    return {
      valid,
      attestation,
      recovered_signer: null,
      reason: valid ? undefined : 'Legacy HMAC verification failed',
    };
  }

  if (!isLikelyAddress(attestation.signer_wallet)) {
    return {
      valid: false,
      attestation,
      recovered_signer: null,
      reason: 'signer_wallet is missing or invalid',
    };
  }

  const domain = parseDomain(attestation.sig_domain) || buildAttestationDomain();
  const message =
    parseMessage(attestation.sig_message) ||
    buildAttestationMessage({
      attestationId: attestation.id,
      contractId: attestation.contract_id,
      attestationType: attestation.type,
      dataHash: attestation.data_hash,
      createdAt: attestation.created_at,
    });

  const result = await verifySignedAttestation({
    payload: attestation.payload,
    dataHash: attestation.data_hash,
    signature: attestation.signature || attestation.tee_signature,
    signerWallet: attestation.signer_wallet,
    domain,
    message,
  });

  return {
    valid: result.valid,
    attestation,
    recovered_signer: result.recovered_signer,
    reason: result.reason,
  };
}
