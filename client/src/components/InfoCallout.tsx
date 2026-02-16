import type { ReactNode } from 'react';
import type { Tone } from '@/lib/status';

interface InfoCalloutProps {
  title: string;
  description: string;
  tone?: Tone;
  children?: ReactNode;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-[var(--line)] bg-[var(--surface-2)]',
  info: 'border-[color:color-mix(in srgb,var(--accent-teal),#ffffff 50%)] bg-[color:color-mix(in srgb,var(--accent-teal),#ffffff 92%)]',
  success: 'border-[color:color-mix(in srgb,var(--success),#ffffff 40%)] bg-[color:color-mix(in srgb,var(--success),#ffffff 92%)]',
  warning: 'border-[color:color-mix(in srgb,var(--warning),#ffffff 40%)] bg-[color:color-mix(in srgb,var(--warning),#ffffff 92%)]',
  danger: 'border-[color:color-mix(in srgb,var(--danger),#ffffff 45%)] bg-[color:color-mix(in srgb,var(--danger),#ffffff 94%)]',
};

export default function InfoCallout({ title, description, tone = 'neutral', children }: InfoCalloutProps) {
  return (
    <aside className={`rounded-2xl border p-4 md:p-5 ${TONE_CLASS[tone]}`}>
      <h4 className="text-sm font-semibold text-[var(--ink)]">{title}</h4>
      <p className="mt-1 text-sm text-[var(--muted-ink)]">{description}</p>
      {children ? <div className="mt-3 text-sm">{children}</div> : null}
    </aside>
  );
}
