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
  const [fundingEscrowId, setFundingEscrowId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dealRetryCount, setDealRetryCount] = useState(0);

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
    setDealRetryCount(0);
  }, [wallet, from, focus]);

  useEffect(() => {
    if (!wallet || from !== 'deal') return;
    if (loading) return;
    if (contracts.length > 0) return;
    if (dealRetryCount >= 8) return;

    const timer = window.setTimeout(() => {
      setDealRetryCount((value) => value + 1);
      void loadContracts();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [wallet, from, loading, contracts.length, dealRetryCount, loadContracts]);

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

  async function handleFundEscrow(contractId: string) {
    if (!wallet) {
      setError('Connect wallet before funding escrow.');
      return;
    }

    setFundingEscrowId(contractId);
    setError('');
    try {
      const prepared = await api.prepareEscrow(contractId);
      const provider = typeof window !== 'undefined'
        ? (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum
        : undefined;
      if (!provider) {
        throw new Error('MetaMask is required to send escrow funding transaction.');
      }

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: wallet,
            to: prepared.fund_tx.to,
            value: `0x${BigInt(prepared.fund_tx.value_wei).toString(16)}`,
            data: prepared.fund_tx.data,
          },
        ],
      });

      if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
        throw new Error('Wallet did not return a valid transaction hash.');
      }

      await api.markEscrowFunded(contractId, txHash);
      await loadContracts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Escrow funding failed');
    } finally {
      setFundingEscrowId(null);
    }
  }

  const pending = contracts.filter((contract) => contract.status === 'pending_resolution');
  const active = contracts.filter((contract) => contract.status === 'active');
  const resolved = contracts.filter((contract) => contract.status === 'resolved');
  const focusedContract = focus ? contracts.find((contract) => contract.id === focus) || null : null;
  const verifyTarget = focusedContract?.escrow?.attestation_id || focusedContract?.attestation_id || null;

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Your Contracts</h1>
            <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
              Clear view of what was agreed, what action is next, and what proof is available.
            </p>
          </div>
          <WalletConnect onConnect={handleConnect} address={wallet} compact />
        </div>

        {from === 'deal' ? (
          <InfoCallout
            title="Agreement saved"
            description={
              contracts.length === 0 && dealRetryCount < 8
                ? 'Finalizing contract handoff. Fetching your latest agreement...'
                : 'Your negotiation is now a contract. Open the highlighted contract and run the next action.'
            }
            tone="success"
          />
        ) : null}

        {focus ? (
          <InfoCallout
            title="Next contract to review"
            description="This highlighted contract is where you should verify proof or complete settlement."
            tone="info"
          >
            {verifyTarget ? (
              <Link href={`/verify?id=${verifyTarget}`} className="button-secondary text-xs">
                Open Verify Page
              </Link>
            ) : (
              <p className="text-xs text-[var(--muted-ink)]">
                Proof is not generated yet for this contract.
              </p>
            )}
          </InfoCallout>
        ) : null}

        {error ? <InfoCallout title="Contract queue warning" description={error} tone="danger" /> : null}
      </section>

      {!wallet ? (
        <EmptyState
          title="Connect to load contract queue"
          description="Contracts are wallet-specific. Connect to load your agreements and next actions."
        />
      ) : loading ? (
        <section className="card animate-pulse p-6 text-sm text-[var(--muted-ink)]">Loading contracts...</section>
      ) : contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Finish a negotiation to create your first contract."
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
                    onFundEscrow={handleFundEscrow}
                    resolving={resolvingId === contract.id}
                    fundingEscrow={fundingEscrowId === contract.id}
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
                    onFundEscrow={handleFundEscrow}
                    fundingEscrow={fundingEscrowId === contract.id}
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
                  <ContractQueueCard
                    key={contract.id}
                    contract={contract}
                    highlighted={focus === contract.id}
                    walletAddress={wallet}
                    onFundEscrow={handleFundEscrow}
                    fundingEscrow={fundingEscrowId === contract.id}
                  />
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
