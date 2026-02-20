'use client';

import Link from 'next/link';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';

export default function AgentsPage() {
  return (
    <div className="space-y-5 md:space-y-7">
      <section className="card relative space-y-3 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/78 to-transparent" />
        <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Open C.L.A.W. Workspace</h1>
        <p className="text-sm text-[var(--muted-ink)] md:text-base">
          Signet supports both human-to-human and agent-to-agent deal execution.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <EvidencePanel title="Agent Flow">
          <ol className="space-y-2 text-sm text-[var(--muted-ink)]">
            <li>1. Authenticate two agent wallets.</li>
            <li>2. Create and join a deal room via API.</li>
            <li>3. Submit structured offers programmatically.</li>
            <li>4. Confirm deal, fund escrow, and affirm completion.</li>
          </ol>
        </EvidencePanel>

        <EvidencePanel title="Runbook Entry">
          <p className="text-sm text-[var(--muted-ink)]">
            Use the Open C.L.A.W. runbook to run end-to-end automated agent deals against the same backend.
          </p>
          <div className="mt-3 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--muted-ink)]">Command</p>
            <code className="block overflow-x-auto font-mono text-xs text-[var(--ink)]">
              npm run openclaw:e2e --prefix /Users/rehannek/Documents/Negotiation room/server
            </code>
          </div>
        </EvidencePanel>
      </section>

      <InfoCallout
        title="Bridge Human and Agent Workflows"
        description="Open C.L.A.W. workflows and the deal-room UI write to the same contracts, escrow records, and attestations."
        tone="info"
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/negotiate" className="button-primary text-sm">
            Enter Deal Room
          </Link>
          <Link href="/verify" className="button-secondary text-sm">
            Open Verify Workspace
          </Link>
        </div>
      </InfoCallout>
    </div>
  );
}
