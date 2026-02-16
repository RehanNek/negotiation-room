'use client';

import { useMemo, useState } from 'react';
import { stringifyRaw, summarizeOfferTerms } from '@/lib/formatters';

interface OfferTermsViewProps {
  terms: unknown;
  title?: string;
  compact?: boolean;
}

function normalizeTerms(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return input;
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

export default function OfferTermsView({ terms, title = 'Terms', compact = false }: OfferTermsViewProps) {
  const [showRaw, setShowRaw] = useState(false);
  const normalized = useMemo(() => normalizeTerms(terms), [terms]);
  const summaries = useMemo(() => summarizeOfferTerms(normalized), [normalized]);
  const isObjectPayload = Boolean(normalized && typeof normalized === 'object' && !Array.isArray(normalized));
  const hasObjectEntries = isObjectPayload && Object.keys(normalized as Record<string, unknown>).length > 0;

  return (
    <div className={`rounded-2xl border border-[var(--line)] bg-white/65 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{title}</h4>
        <button
          onClick={() => setShowRaw((value) => !value)}
          className="rounded-full border border-[var(--line)] px-2 py-1 text-[11px] font-medium text-[var(--muted-ink)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
          type="button"
        >
          {showRaw ? 'Simple View' : 'Details'}
        </button>
      </div>

      {showRaw ? (
        <pre className="max-h-64 overflow-auto rounded-xl bg-[var(--surface-3)] p-3 text-xs leading-relaxed text-[var(--ink)]">
          {stringifyRaw(normalized)}
        </pre>
      ) : summaries.length > 0 ? (
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          {summaries.map((item) => (
            <div key={item.key} className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-ink)]">{item.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-[var(--ink)]">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : isObjectPayload && !hasObjectEntries ? (
        <p className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--muted-ink)]">
          No structured terms provided yet.
        </p>
      ) : isObjectPayload ? (
        <pre className="max-h-64 overflow-auto rounded-xl bg-[var(--surface-3)] p-3 text-xs leading-relaxed text-[var(--ink)]">
          {stringifyRaw(normalized)}
        </pre>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 text-sm text-[var(--ink)]">
          {typeof normalized === 'string' && normalized.trim() ? normalized : 'No structured terms provided yet.'}
        </p>
      )}
    </div>
  );
}
