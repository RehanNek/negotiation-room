'use client';

import StatusPill from '@/components/StatusPill';

interface ReputationBadgeProps {
  score: number;
  goodFaith: number;
  deals: number;
  compact?: boolean;
  showTier?: boolean;
  className?: string;
}

function tierForScore(score: number): { label: string; tone: 'success' | 'info' | 'warning' } {
  if (score >= 50) return { label: 'Sovereign', tone: 'success' };
  if (score >= 30) return { label: 'Verified', tone: 'info' };
  if (score >= 10) return { label: 'Emerging', tone: 'warning' };
  // Keep low-tier styling aligned with the white/gold visual system.
  return { label: 'Unproven', tone: 'info' };
}

export default function ReputationBadge({
  score,
  goodFaith,
  deals,
  compact = false,
  showTier = true,
  className = '',
}: ReputationBadgeProps) {
  const tier = tierForScore(score);

  if (compact) {
    return <StatusPill label={`${tier.label} ${score}`} tone={tier.tone} />;
  }

  return (
    <div className={`card space-y-3 p-5 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Reputation Ledger</p>
        {showTier ? <StatusPill label={tier.label} tone={tier.tone} /> : null}
      </div>

      <div className="flex items-end gap-2">
        <p className="font-display text-5xl leading-none text-[var(--ink)]">{score}</p>
        <p className="pb-1 text-sm text-[var(--muted-ink)]">Total score</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--ink)]">Good Faith</p>
          <p className="mt-1 font-semibold text-[var(--ink)]">{goodFaith}%</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <p className="text-xs uppercase tracking-wide text-[var(--ink)]">Deals</p>
          <p className="mt-1 font-semibold text-[var(--ink)]">{deals}</p>
        </div>
      </div>
    </div>
  );
}
