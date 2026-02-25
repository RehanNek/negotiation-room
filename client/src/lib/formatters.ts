import type { ContractStatus, DealType, NegotiationStatus } from './types';

export interface OfferTermSummary {
  key: string;
  label: string;
  value: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  raw: 'Message',
  message: 'Message',
  text: 'Message',
  party_a_offer: 'Requester Terms',
  party_b_offer: 'Provider Terms',
  agreed_terms: 'Agreed Terms',
  party_a_message: 'Requester Message',
  party_b_message: 'Provider Message',
  service: 'Service',
  deliverables: 'Deliverables',
  price_amount: 'Price',
  amount: 'Price',
  price: 'Price',
  currency: 'Currency',
  token: 'Currency',
  timeline: 'Timeline',
  duration: 'Timeline',
  deadline: 'Deadline',
  schedule: 'Days & Time',
  payment_terms: 'Payment Terms',
  acceptance_criteria: 'Completion Rule',
  resolution_date: 'Resolution Date',
  condition_desc: 'Condition',
  agreement: 'Agreement',
  amount_eth: 'Amount (ETH)',
  notes: 'Additional notes',
};

const INTERNAL_TERM_KEYS = new Set([
  'agreed_terms',
  'party_a_offer',
  'party_b_offer',
  'party_a_message',
  'party_b_message',
  'missing_terms',
  'term_extraction_confidence',
  'confidence',
]);

function toTitleCase(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (LABEL_OVERRIDES[normalized]) {
    return LABEL_OVERRIDES[normalized];
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

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return value
    .toFixed(2)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

function formatPriceValue(amount: unknown, currency: unknown): string | null {
  const numericAmount = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (typeof numericAmount !== 'number' || Number.isNaN(numericAmount)) return null;
  const currencyValue = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : '';
  return currencyValue ? `${formatNumber(numericAmount)} ${currencyValue}` : formatNumber(numericAmount);
}

function humanizeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') return formatNumber(value);
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

    return 'See details';
  }

  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function selectDisplayTerms(terms: unknown): unknown {
  const record = asRecord(terms);
  if (!record) return terms;

  if (asRecord(record.agreement)) {
    return record.agreement;
  }

  if (asRecord(record.agreed_terms)) {
    return record.agreed_terms;
  }

  if (typeof record.raw === 'string' && record.raw.trim()) {
    return { message: record.raw };
  }

  return record;
}

export function extractMissingTerms(terms: unknown): string[] {
  const record = asRecord(terms);
  if (!record || !Array.isArray(record.missing_terms)) return [];
  const deduped = new Set<string>();
  for (const term of record.missing_terms) {
    if (typeof term !== 'string') continue;
    const normalized = term.trim().toLowerCase();
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

export function formatMissingTermLabel(term: string): string {
  if (term === 'timeline_or_schedule') return 'Timeline or schedule';
  if (term === 'condition_or_resolution_rule') return 'Condition or resolution rule';
  return toTitleCase(term);
}

function buildPrioritizedSummaries(record: Record<string, unknown>): OfferTermSummary[] {
  const results: OfferTermSummary[] = [];
  const usedKeys = new Set<string>();

  const priceValue = formatPriceValue(
    record.price_amount ?? record.amount ?? record.price,
    record.currency ?? record.token
  );
  if (priceValue) {
    results.push({ key: 'price_amount', label: 'Price', value: priceValue });
    usedKeys.add('price_amount');
    usedKeys.add('amount');
    usedKeys.add('price');
    usedKeys.add('currency');
    usedKeys.add('token');
  }

  const preferredOrder = [
    'service',
    'deliverables',
    'timeline',
    'deadline',
    'schedule',
    'payment_terms',
    'acceptance_criteria',
    'condition_desc',
    'resolution_date',
  ];

  for (const key of preferredOrder) {
    if (!isMeaningful(record[key])) continue;
    results.push({
      key,
      label: toTitleCase(key),
      value: humanizeScalar(record[key]),
    });
    usedKeys.add(key);
  }

  for (const [key, value] of Object.entries(record)) {
    if (usedKeys.has(key) || INTERNAL_TERM_KEYS.has(key)) continue;
    if (!isMeaningful(value)) continue;
    results.push({
      key,
      label: toTitleCase(key),
      value: humanizeScalar(value),
    });
  }

  return results;
}

export function summarizeOfferTerms(terms: unknown): OfferTermSummary[] {
  const selected = selectDisplayTerms(terms);
  const record = asRecord(selected);
  if (!record) {
    return [];
  }
  return buildPrioritizedSummaries(record);
}

export function stringifyRaw(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fallbackContractSummary(dealType: DealType, terms: unknown): string {
  const selected = selectDisplayTerms(terms);
  const record = asRecord(selected);
  const intro = dealType === 'conditional' ? 'Conditional contract recorded.' : 'Service contract recorded.';
  if (!record) {
    return `${intro} Terms are captured in the contract details.`;
  }

  const snippets = buildPrioritizedSummaries(record)
    .slice(0, 3)
    .map((term) => `${term.label}: ${term.value}`);

  if (snippets.length === 0) {
    return `${intro} Terms are captured in the contract details.`;
  }
  return `${intro} ${snippets.join(' • ')}.`;
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

export function reputationToStars(score: number): string {
  const filled = Math.min(5, Math.max(0, Math.ceil(Math.max(0, score) / 20)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function formatWallet(wallet: string | null | undefined, start: number = 6, end: number = 4): string {
  if (!wallet) return 'Unknown Wallet';
  if (wallet.length <= start + end) return wallet;
  return `${wallet.slice(0, start)}...${wallet.slice(-end)}`;
}

export function formatWeiToEth(wei: string | null | undefined, maxFractionDigits: number = 6): string {
  if (!wei || !/^\d+$/.test(wei)) return 'n/a';

  try {
    const base = BigInt('1000000000000000000');
    const value = BigInt(wei);
    const whole = value / base;
    const fraction = (value % base).toString().padStart(18, '0');
    const trimmed = fraction.replace(/0+$/, '');
    if (!trimmed) return `${whole.toString()} ETH`;
    const sliced = trimmed.slice(0, Math.max(1, Math.min(18, maxFractionDigits)));
    return `${whole.toString()}.${sliced} ETH`;
  } catch {
    return 'n/a';
  }
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
    impasse: 'Deal room closed without agreement.',
    no_deal: 'A participant exited the deal room.',
    pending_resolution: 'Rule check required before final outcome.',
    resolved: 'Outcome recorded with attestation.',
  };

  return hints[status] || 'Status available.';
}
