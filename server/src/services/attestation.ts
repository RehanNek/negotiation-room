import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { run, get } from '../db';

export function createAttestation(
  contractId: string,
  type: string,
  payload: Record<string, any>
): { id: string; data_hash: string; tee_signature: string } {
  const id = uuidv4();
  const payloadStr = JSON.stringify(payload);
  const dataHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

  const teeSignature = crypto
    .createHmac('sha256', process.env.TEE_ATTESTATION_KEY || 'the-room-tee-key')
    .update(`${id}:${contractId}:${dataHash}`)
    .digest('hex');

  run(
    `INSERT INTO attestations (id, contract_id, type, data_hash, tee_signature, payload) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, contractId, type, dataHash, teeSignature, payloadStr]
  );

  return { id, data_hash: dataHash, tee_signature: teeSignature };
}

export function getAttestation(attestationId: string): any {
  const row = get('SELECT * FROM attestations WHERE id = ?', [attestationId]);
  if (!row) return null;
  return {
    ...row,
    payload: JSON.parse(row.payload as string),
  };
}

export function verifyAttestation(attestationId: string): { valid: boolean; attestation: any } {
  const attestation = getAttestation(attestationId);
  if (!attestation) return { valid: false, attestation: null };

  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(attestation.payload)).digest('hex');
  const expectedSig = crypto
    .createHmac('sha256', process.env.TEE_ATTESTATION_KEY || 'the-room-tee-key')
    .update(`${attestation.id}:${attestation.contract_id}:${expectedHash}`)
    .digest('hex');

  return {
    valid: expectedHash === attestation.data_hash && expectedSig === attestation.tee_signature,
    attestation,
  };
}
