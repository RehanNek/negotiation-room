import type { ReactNode } from 'react';

interface EvidencePanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function EvidencePanel({ title, subtitle, children, className = '' }: EvidencePanelProps) {
  return (
    <section className={`card p-5 md:p-6 ${className}`.trim()}>
      <div className="mb-4">
        <h3 className="font-display text-2xl text-[var(--ink)]">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted-ink)]">{subtitle}</p>}
      </div>
      <div className="space-y-3 text-sm text-[var(--ink)]">{children}</div>
    </section>
  );
}
