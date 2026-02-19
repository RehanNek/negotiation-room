import type { Tone } from '@/lib/status';

interface StatusPillProps {
  label: string;
  tone: Tone;
  pulse?: boolean;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted-ink)]',
  info: 'border-[color:color-mix(in_srgb,var(--accent-gold),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--accent-gold)_12%)] text-[var(--ink)]',
  success: 'border-[color:color-mix(in_srgb,var(--success),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--success)_16%)] text-[var(--ink)]',
  warning: 'border-[color:color-mix(in_srgb,var(--warning),#000000_45%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--warning)_14%)] text-[var(--ink)]',
  danger: 'border-[color:color-mix(in_srgb,var(--danger),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--danger)_16%)] text-[var(--ink)]',
};

export default function StatusPill({ label, tone, pulse = false }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASS[tone]}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
