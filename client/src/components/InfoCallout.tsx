import type { ReactNode } from 'react';
import type { Tone } from '@/lib/status';

interface InfoCalloutProps {
  title: string;
  description: string;
  tone?: Tone;
  children?: ReactNode;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-[var(--line)] bg-[color:color-mix(in_srgb,var(--surface-2),#000000_20%)]',
  info: 'border-[color:color-mix(in_srgb,var(--accent-gold),#000000_40%)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--accent-gold)_10%)]',
  success: 'border-[color:color-mix(in_srgb,var(--success),#000000_38%)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--success)_14%)]',
  warning: 'border-[color:color-mix(in_srgb,var(--warning),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--warning)_14%)]',
  danger: 'border-[color:color-mix(in_srgb,var(--danger),#000000_40%)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--danger)_14%)]',
};

export default function InfoCallout({ title, description, tone = 'neutral', children }: InfoCalloutProps) {
  return (
    <aside className={`rounded-2xl border p-4 md:p-5 ${TONE_CLASS[tone]}`}>
      <h4 className="text-sm font-semibold tracking-[0.04em] text-[var(--ink)]">{title}</h4>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-ink)]">{description}</p>
      {children ? <div className="mt-3 text-sm">{children}</div> : null}
    </aside>
  );
}
