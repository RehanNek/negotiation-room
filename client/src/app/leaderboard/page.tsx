'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import InfoCallout from '@/components/InfoCallout';
import { api } from '@/lib/api';
import { formatWallet, reputationToStars } from '@/lib/formatters';
import type { ReputationViewModel } from '@/lib/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<ReputationViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getLeaderboard(20)
      .then((data) => {
        setLeaderboard(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-5 md:space-y-7">
      <section className="card relative space-y-3 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/70 to-transparent" />
        <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Leaderboard</h1>
        <p className="text-sm text-[var(--muted-ink)] md:text-base">
          Top-rated participants on the platform.
        </p>
      </section>

      {loading ? (
        <section className="card p-5 md:p-6">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--surface-2)]" />
            ))}
          </div>
        </section>
      ) : error ? (
        <InfoCallout title="Could not load leaderboard" description={error} tone="danger" />
      ) : leaderboard.length === 0 ? (
        <EmptyState
          title="No participants yet"
          description="Be the first to complete a deal and appear on the leaderboard."
        />
      ) : (
        <section className="card overflow-hidden p-0">
          <div className="border-b border-[var(--line)] px-5 py-3 md:px-6">
            <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
              <span>Rank</span>
              <span>Participant</span>
              <span>Reputation</span>
              <span>Deals</span>
            </div>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.wallet_address}
                className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-4 px-5 py-3 md:px-6"
              >
                <span className="text-center">{MEDALS[i] ?? <span className="font-mono text-sm text-[var(--muted-ink)]">{i + 1}</span>}</span>
                <span className="font-mono text-sm text-[var(--ink)]">{formatWallet(entry.wallet_address)}</span>
                <span className="text-sm text-[var(--accent-gold)]">{reputationToStars(entry.total_reputation)}</span>
                <span className="text-right text-xs text-[var(--muted-ink)]">{entry.deals_completed}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3 p-5 text-center md:p-6">
        <p className="text-sm text-[var(--muted-ink)]">Want to climb the leaderboard?</p>
        <Link href="/negotiate" className="button-primary">
          Enter Deal Room
        </Link>
      </section>
    </div>
  );
}
