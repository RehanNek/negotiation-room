import crypto from 'crypto';
import { keccak256, stringToHex } from 'viem';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortObject(child)]);

  return Object.fromEntries(entries);
}

export function canonicalizeTerms(terms: Record<string, unknown>): string {
  const normalized = sortObject(terms);
  return JSON.stringify(normalized);
}

export function computeTermsHash(terms: Record<string, unknown>): string {
  const canonical = canonicalizeTerms(terms);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function computeDealHash(input: {
  contractId: string;
  termsHash: string;
  payerWallet: string;
  recipientIfTrueWallet: string;
  recipientIfFalseWallet: string;
  amountWei: string;
  timeoutAt: string;
}): `0x${string}` {
  const payload = JSON.stringify({
    contract_id: input.contractId,
    terms_hash: input.termsHash,
    payer_wallet: input.payerWallet.toLowerCase(),
    recipient_if_true_wallet: input.recipientIfTrueWallet.toLowerCase(),
    recipient_if_false_wallet: input.recipientIfFalseWallet.toLowerCase(),
    amount_wei: input.amountWei,
    timeout_at: input.timeoutAt,
  });

  return keccak256(stringToHex(payload));
}
