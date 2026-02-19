import fs from 'fs';
import path from 'path';
import { buildAttestationDomain, buildAttestationMessage, verifySignedAttestation } from '../src/services/attestation-core';

interface OfflineAttestationInput {
  id: string;
  contract_id: string;
  type: string;
  data_hash: string;
  signature?: string | null;
  tee_signature?: string | null;
  signer_wallet?: string | null;
  sig_domain?: {
    name: string;
    version: string;
    chainId: number;
  } | null;
  sig_message?: {
    attestationId: string;
    contractId: string;
    attestationType: string;
    dataHash: string;
    createdAt: string;
  } | null;
  payload: Record<string, unknown>;
  created_at: string;
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: tsx scripts/verify-attestation-local.ts <path-to-attestation-json>');
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), source);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const input = JSON.parse(raw) as OfflineAttestationInput;
  const signature = input.signature || input.tee_signature;
  if (!signature) {
    console.error('Missing signature in attestation payload');
    process.exit(1);
  }
  if (!input.signer_wallet) {
    console.error('Missing signer_wallet in attestation payload');
    process.exit(1);
  }

  const domain = input.sig_domain || buildAttestationDomain();
  const message = input.sig_message || buildAttestationMessage({
    attestationId: input.id,
    contractId: input.contract_id,
    attestationType: input.type,
    dataHash: input.data_hash,
    createdAt: input.created_at,
  });

  const result = await verifySignedAttestation({
    payload: input.payload,
    dataHash: input.data_hash,
    signature,
    signerWallet: input.signer_wallet,
    domain,
    message,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exit(2);
}

void main();
