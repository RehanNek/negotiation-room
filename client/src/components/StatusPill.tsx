import type { Tone } from '@/lib/status';

interface StatusPillProps {
  label: string;
  tone: Tone;
  pulse?: boolean;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted-ink)]',
  info: 'border-[color:color-mix(in srgb,var(--accent-teal),#ffffff 50%)] bg-[color:color-mix(in srgb,var(--accent-teal),#ffffff 86%)] text-[color:color-mix(in srgb,var(--accent-teal),#000000 35%)]',
  success: 'border-[color:color-mix(in srgb,var(--success),#ffffff 40%)] bg-[color:color-mix(in srgb,var(--success),#ffffff 86%)] text-[color:color-mix(in srgb,var(--success),#000000 35%)]',
  warning: 'border-[color:color-mix(in srgb,var(--warning),#ffffff 40%)] bg-[color:color-mix(in srgb,var(--warning),#ffffff 86%)] text-[color:color-mix(in srgb,var(--warning),#000000 25%)]',
  danger: 'border-[color:color-mix(in srgb,var(--danger),#ffffff 45%)] bg-[color:color-mix(in srgb,var(--danger),#ffffff 88%)] text-[color:color-mix(in srgb,var(--danger),#000000 30%)]',
};

export default function StatusPill({ label, tone, pulse = false }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASS[tone]}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
