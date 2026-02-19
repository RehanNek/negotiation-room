'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';
import ReputationBadge from '@/components/ReputationBadge';
import WalletConnect from '@/components/WalletConnect';
import { api } from '@/lib/api';
import { buildReadableContractSummary, formatTimestamp } from '@/lib/formatters';
import type { ContractViewModel, ReputationViewModel } from '@/lib/types';

export default function ProfilePage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [reputation, setReputation] = useState<ReputationViewModel | null>(null);
  const [contracts, setContracts] = useState<ContractViewModel[]>([]);
  const [error, setError] = useState('');

  const handleConnect = useCallback((address: string) => {
    const normalized = address || null;
    setWallet(normalized);
    if (!normalized) {
      setReputation(null);
      setContracts([]);
      setError('');
    }
  }, []);

  useEffect(() => {
    if (!wallet) return;

    Promise.all([api.getReputation(wallet), api.getContractsByWallet(wallet)])
      .then(([rep, contractList]) => {
        setError('');
        setReputation(rep);
        setContracts(contractList);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load profile data');
      });
  }, [wallet]);

  const summary = useMemo(() => {
    const pending = contracts.filter((contract) => contract.status === 'pending_resolution').length;
    const resolved = contracts.filter((contract) => contract.status === 'resolved').length;
    return {
      pending,
      resolved,
      total: contracts.length,
    };
  }, [contracts]);

  const recentContracts = contracts
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Reputation Ledger</h1>
            <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
              Track deal-room behavior, resolution quality, and verifiable history tied to your wallet identity.
            </p>
          </div>
          <WalletConnect onConnect={handleConnect} address={wallet} compact />
        </div>

        {error ? <InfoCallout title="Profile warning" description={error} tone="danger" /> : null}
      </section>

      {!wallet ? (
        <EmptyState
          title="Connect to view profile"
          description="Profile and reputation diagnostics are wallet-scoped. Connect a session to load your metrics and history."
        />
      ) : !reputation ? (
        <section className="card animate-pulse p-6 text-sm text-[var(--muted-ink)]">Loading profile...</section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <ReputationBadge score={reputation.total_reputation} goodFaith={reputation.good_faith_score} deals={reputation.deals_completed} />

            <article className="card p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">Total Deal Rooms</p>
              <p className="mt-2 font-display text-4xl text-[var(--ink)]">{reputation.total_negotiations}</p>
            </article>

            <article className="card p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">Pending Resolutions</p>
              <p className="mt-2 font-display text-4xl text-[var(--ink)]">{summary.pending}</p>
            </article>

            <article className="card p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink)]">Resolved Contracts</p>
              <p className="mt-2 font-display text-4xl text-[var(--ink)]">{summary.resolved}</p>
            </article>
          </section>

          <section className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
            <EvidencePanel title="Reputation Diagnostics" subtitle="Layered details for judges and technical reviewers.">
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">Average Messages: {reputation.avg_rounds.toFixed(2)}</p>
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">Conditional Deals: {reputation.conditional_deals}</p>
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">Contracts Seen: {summary.total}</p>
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">Last Updated: {formatTimestamp(reputation.last_updated)}</p>
              </div>

              <details className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">Technical scoring interpretation</summary>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">
                  Reputation captures deal outcomes, chat efficiency, and good-faith behavior. It is not a legal guarantee, but a historical signal
                  anchored by attested process records.
                </p>
              </details>
            </EvidencePanel>

            <EvidencePanel title="Recent Contract History" subtitle="Quick access to latest records and attestation links.">
              {recentContracts.length === 0 ? (
                <p className="text-sm text-[var(--muted-ink)]">No contracts recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentContracts.map((contract) => (
                    <div key={contract.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-ink)]">
                        <span className="uppercase tracking-wide">{contract.deal_type}</span>
                        <span>{contract.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--ink)]">
                        {buildReadableContractSummary(contract.deal_type, contract.summary, contract.terms)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link href={`/contracts?focus=${contract.id}`} className="button-secondary text-xs">
                          Open Contract
                        </Link>
                        {contract.attestation_id ? (
                          <Link href={`/verify?id=${contract.attestation_id}`} className="button-ghost text-xs">
                            Verify
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </EvidencePanel>
          </section>
        </>
      )}
    </div>
  );
}
