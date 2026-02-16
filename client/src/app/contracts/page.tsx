'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ContractQueueCard from '@/components/ContractQueueCard';
import EmptyState from '@/components/EmptyState';
import InfoCallout from '@/components/InfoCallout';
import WalletConnect from '@/components/WalletConnect';
import { api } from '@/lib/api';
import { parseContractFocus } from '@/lib/flow';
import type { ContractViewModel } from '@/lib/types';

function ContractsWorkspace() {
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractViewModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [affirmingId, setAffirmingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { focus, from } = useMemo(() => parseContractFocus(searchParams), [searchParams]);

  const handleConnect = useCallback((address: string) => {
    setWallet(address || null);
  }, []);

  const loadContracts = useCallback(async () => {
    if (!wallet) {
      setContracts([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const list = await api.getContractsByWallet(wallet);
      setContracts(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts');
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  useEffect(() => {
    if (!focus || contracts.length === 0) return;
    const element = document.getElementById(`contract-${focus}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, contracts]);

  async function handleResolve(contractId: string) {
    setResolvingId(contractId);
    setError('');
    try {
      await api.resolveCondition(contractId);
      await loadContracts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setResolvingId(null);
    }
  }

  async function handleAffirmService(contractId: string) {
    setAffirmingId(contractId);
    setError('');
    try {
      await api.affirmServiceDelivery(contractId);
      await loadContracts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Affirmation failed');
    } finally {
      setAffirmingId(null);
    }
  }

  const pending = contracts.filter((contract) => contract.status === 'pending_resolution');
  const active = contracts.filter((contract) => contract.status === 'active');
  const resolved = contracts.filter((contract) => contract.status === 'resolved');
  const focusedContract = focus ? contracts.find((contract) => contract.id === focus) || null : null;
  const verifyTarget = focusedContract?.attestation_id || null;

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Contract Queue</h1>
            <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
              Rule execution queue for agreements reached without a middleman, from live contracts to attested outcomes.
            </p>
          </div>
          <WalletConnect onConnect={handleConnect} address={wallet} compact />
        </div>

        {from === 'deal' ? (
          <InfoCallout
            title="Deal handoff complete"
            description="You arrived from a completed negotiation. Verify once backend attestation is available, then complete settlement attestation."
            tone="success"
          />
        ) : null}

        {focus ? (
          <InfoCallout
            title="Focused contract"
            description="The highlighted contract is your immediate action target for verification or settlement."
            tone="info"
          >
            {verifyTarget ? (
              <Link href={`/verify?id=${verifyTarget}`} className="button-secondary text-xs">
                Open Verify Workspace
              </Link>
            ) : (
              <p className="text-xs text-[var(--muted-ink)]">
                Backend attestation is not available yet for this contract.
              </p>
            )}
          </InfoCallout>
        ) : null}

        {error ? <InfoCallout title="Contract queue warning" description={error} tone="danger" /> : null}
      </section>

      {!wallet ? (
        <EmptyState
          title="Connect to load contract queue"
          description="Your queue is scoped to the authenticated wallet. Connect first to see pending actions and attested outcomes."
        />
      ) : loading ? (
        <section className="card animate-pulse p-6 text-sm text-[var(--muted-ink)]">Loading contracts...</section>
      ) : contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Complete a negotiation flow to generate the first contract record in your queue."
          action={
            <Link href="/negotiate" className="button-primary text-sm">
              Start Negotiation
            </Link>
          }
        />
      ) : (
        <>
          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Needs Action ({pending.length})</h2>
              <div className="space-y-3">
                {pending.map((contract) => (
                  <ContractQueueCard
                    key={contract.id}
                    contract={contract}
                    highlighted={focus === contract.id}
                    walletAddress={wallet}
                    onResolve={handleResolve}
                    resolving={resolvingId === contract.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {active.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Active ({active.length})</h2>
              <div className="space-y-3">
                {active.map((contract) => (
                  <ContractQueueCard
                    key={contract.id}
                    contract={contract}
                    highlighted={focus === contract.id}
                    walletAddress={wallet}
                    onAffirmService={handleAffirmService}
                    affirming={affirmingId === contract.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {resolved.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Resolved ({resolved.length})</h2>
              <div className="space-y-3">
                {resolved.map((contract) => (
                  <ContractQueueCard key={contract.id} contract={contract} highlighted={focus === contract.id} walletAddress={wallet} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<section className="card p-6 text-sm text-[var(--muted-ink)]">Loading contract queue...</section>}>
      <ContractsWorkspace />
    </Suspense>
  );
}
