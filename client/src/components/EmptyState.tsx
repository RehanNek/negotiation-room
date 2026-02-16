import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-8 text-center md:p-10">
      <h3 className="font-display text-2xl text-[var(--ink)]">{title}</h3>
      <p className="max-w-xl text-sm text-[var(--muted-ink)] md:text-base">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
