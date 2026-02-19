'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import EvidencePanel from '@/components/EvidencePanel';
import HeroNarrative from '@/components/HeroNarrative';
import ReputationBadge from '@/components/ReputationBadge';
import WalletConnect from '@/components/WalletConnect';
import { api } from '@/lib/api';
import type { ReputationViewModel } from '@/lib/types';

export default function HomePage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [reputation, setReputation] = useState<ReputationViewModel | null>(null);

  const handleConnect = useCallback((address: string) => {
    const normalized = address || null;
    setWallet(normalized);
    if (!normalized) {
      setReputation(null);
    }
  }, []);

  useEffect(() => {
    if (!wallet) return;

    api.getReputation(wallet)
      .then(setReputation)
      .catch(() => setReputation(null));
  }, [wallet]);

  return (
    <div className="space-y-7 md:space-y-10">
      <HeroNarrative />

      <section className="grid gap-4 md:gap-5 md:grid-cols-2">
        <EvidencePanel
          className="h-full"
          title="Privacy Layer"
          subtitle="Connect with a wallet and negotiate with private constraints that are not exposed to counterparties or platform operators."
        >
          <WalletConnect onConnect={handleConnect} address={wallet} />
        </EvidencePanel>

        {wallet && reputation ? (
          <ReputationBadge
            className="h-full"
            showTier={false}
            score={reputation.total_reputation}
            goodFaith={reputation.good_faith_score}
            deals={reputation.deals_completed}
          />
        ) : (
          <EmptyState
            className="h-full"
            title="No reputation loaded"
            description="Connect a wallet to see how completed agreements and attested outcomes build verifiable trust over time."
          />
        )}
      </section>

      <section className="grid gap-4 md:gap-5 md:grid-cols-2">
        <EvidencePanel className="h-full" title="Verifiability Layer">
          <ul className="space-y-2 text-sm text-[var(--muted-ink)]">
            <li>• Deal state is recorded with verifiable contract snapshots.</li>
            <li>• Rule application (condition checks or service affirmation) produces attested outcomes.</li>
            <li>• Verification workspace exposes payload hash, signature, and contract linkage.</li>
          </ul>
          <div className="pt-2">
            <Link href="/verify" className="button-primary">
              Open Verify Workspace
            </Link>
          </div>
        </EvidencePanel>

        <article className="card relative h-full p-5 md:p-6">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/70 to-transparent" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">No-Middleman Guarantee</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted-ink)]">
            <li>• Any two parties can negotiate under shared rules.</li>
            <li>• Rule execution happens in EigenCloud TEE, not through manual arbitration.</li>
            <li>• Final state and resolution are independently auditable.</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
