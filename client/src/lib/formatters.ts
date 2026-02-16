import type { ContractStatus, DealType, NegotiationStatus } from './types';

export interface OfferTermSummary {
  key: string;
  label: string;
  value: string;
}

function toTitleCase(input: string): string {
  const normalized = input.trim().toLowerCase();
  const labelOverrides: Record<string, string> = {
    raw: 'Message',
    message: 'Message',
    text: 'Message',
    party_a_offer: 'Requester Terms',
    party_b_offer: 'Provider Terms',
    agreed_terms: 'Agreed Terms',
    party_a_message: 'Requester Message',
    party_b_message: 'Provider Message',
  };
  if (labelOverrides[normalized]) {
    return labelOverrides[normalized];
  }

  return input
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isScalar(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  );
}

function humanizeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => humanizeScalar(item)).join(', ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const primaryText = [record.message, record.raw, record.text].find(
      (entry) => typeof entry === 'string' && entry.trim()
    ) as string | undefined;
    if (primaryText) return primaryText;

    const keyScalars = Object.entries(record)
      .filter(([, item]) => isScalar(item))
      .slice(0, 3)
      .map(([key, item]) => `${toTitleCase(key)}: ${humanizeScalar(item)}`);

    if (keyScalars.length > 0) {
      return keyScalars.join('; ');
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function summarizeOfferTerms(terms: unknown): OfferTermSummary[] {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) {
    return [];
  }

  const entries = Object.entries(terms as Record<string, unknown>);
  return entries.map(([key, value]) => ({
    key,
    label: toTitleCase(key),
    value: humanizeScalar(value),
  }));
}

export function stringifyRaw(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function selectSummaryTerms(terms: unknown): unknown {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) {
    return terms;
  }
  const record = terms as Record<string, unknown>;

  if (record.agreed_terms && typeof record.agreed_terms === 'object') {
    return record.agreed_terms;
  }

  if (typeof record.raw === 'string' && record.raw.trim()) {
    return { message: record.raw };
  }

  return terms;
}

function fallbackContractSummary(dealType: DealType, terms: unknown): string {
  const selected = selectSummaryTerms(terms);
  const snippets = summarizeOfferTerms(selected)
    .slice(0, 3)
    .map((term) => `${term.label}: ${term.value}`);

  const intro = dealType === 'conditional'
    ? 'Conditional contract recorded.'
    : 'Service contract recorded.';

  if (snippets.length === 0) {
    return `${intro} Terms are captured in the contract details.`;
  }
  return `${intro} Key terms: ${snippets.join(', ')}.`;
}

export function buildReadableContractSummary(dealType: DealType, summary: string | null | undefined, terms: unknown): string {
  const fallback = fallbackContractSummary(dealType, terms);
  if (!summary || typeof summary !== 'string') return fallback;

  const cleaned = summary.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned === '[object Object]' || cleaned.length > 420) {
    return fallback;
  }

  const suspiciousFragments = [
    'we need to generate a summary',
    'respond only with json',
    'provide 2-3 sentences',
    'so summary',
    'terms raw',
    '"summary"',
  ];
  if (suspiciousFragments.some((fragment) => cleaned.toLowerCase().includes(fragment))) {
    return fallback;
  }

  return cleaned;
}

export function formatWallet(wallet: string | null | undefined, start: number = 6, end: number = 4): string {
  if (!wallet) return 'Unknown Wallet';
  if (wallet.length <= start + end) return wallet;
  return `${wallet.slice(0, start)}...${wallet.slice(-end)}`;
}

export function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Unknown time';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeStatusHint(status: NegotiationStatus | ContractStatus): string {
  const hints: Record<string, string> = {
    waiting: 'Awaiting the second party to join.',
    active: 'Live and accepting actions.',
    deal: 'Deal reached. Contract should now exist.',
    impasse: 'Max rounds reached without convergence.',
    no_deal: 'A participant exited the negotiation.',
    pending_resolution: 'Ready for condition resolution.',
    resolved: 'Final verdict and attestation available.',
  };

  return hints[status] || 'Status available.';
}
