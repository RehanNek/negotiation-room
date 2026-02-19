import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`card flex flex-col items-center justify-center gap-3 p-8 text-center md:p-10 ${className}`.trim()}>
      <h3 className="font-display text-2xl text-[var(--ink)]">{title}</h3>
      <p className="max-w-xl text-sm text-[var(--muted-ink)] md:text-base">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
