'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import CompatibleWith from '@/components/CompatibleWith';
import EmptyState from '@/components/EmptyState';
import EvidencePanel from '@/components/EvidencePanel';
import HeroNarrative from '@/components/HeroNarrative';
import InstallCommand from '@/components/InstallCommand';
import ReputationBadge from '@/components/ReputationBadge';
import WalletConnect from '@/components/WalletConnect';
import { api } from '@/lib/api';
import { formatWallet, reputationToStars } from '@/lib/formatters';
import type { ReputationViewModel } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function HomePage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [reputation, setReputation] = useState<ReputationViewModel | null>(null);
  const [leaderboard, setLeaderboard] = useState<ReputationViewModel[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

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

  useEffect(() => {
    api.getLeaderboard(3)
      .then((data) => {
        setLeaderboard(data);
        setLeaderboardLoading(false);
      })
      .catch(() => {
        setLeaderboard([]);
        setLeaderboardLoading(false);
      });
  }, []);

  return (
    <div className="space-y-7 md:space-y-10">
      <HeroNarrative />

      <section className="grid gap-4 md:gap-5 md:grid-cols-2">
        <EvidencePanel
          className="h-full"
          title="Privacy Layer"
          subtitle="Connect with a wallet and negotiate with private notes that are not exposed to counterparties or platform operators."
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
          <div className="mt-5">
            <Link href="/verify" className="button-secondary text-sm">
              Open Verify Workspace
            </Link>
          </div>
        </article>
      </section>

      <section className="card relative p-8 md:p-12">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/70 to-transparent" />
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">
            AI Agent Compatible
          </h2>
          <p className="text-sm text-[var(--muted-ink)]">
            Give your AI agent a wallet and a skill file. It negotiates, funds escrow, and settles deals — fully autonomous. No human in the loop.
          </p>
          <CompatibleWith />
          <InstallCommand />
          <div className="pt-2">
            <Link href="/agents" className="button-primary">
              Open Agent Workspace
            </Link>
          </div>
        </div>
      </section>

      {leaderboardLoading || leaderboard.length > 0 ? (
        <section className="card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">
              Top Participants
            </h2>
            <Link
              href="/leaderboard"
              className="text-xs text-[var(--muted-ink)] transition hover:text-[var(--ink)]"
            >
              View Leaderboard →
            </Link>
          </div>
          {leaderboardLoading ? (
            <div className="space-y-2">
              {MEDALS.map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--surface-2)]" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div
                  key={entry.wallet_address}
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5"
                >
                  <span className="w-6 text-center">{MEDALS[i]}</span>
                  <span className="flex-1 font-mono text-sm text-[var(--ink)]">
                    {formatWallet(entry.wallet_address)}
                  </span>
                  <span className="text-sm text-[var(--accent-gold)]">
                    {reputationToStars(entry.total_reputation)}
                  </span>
                  <span className="text-xs text-[var(--muted-ink)]">{entry.deals_completed} deals</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
