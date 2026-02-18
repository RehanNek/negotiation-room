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
import { formatWallet } from '@/lib/formatters';
import type { Tone } from '@/lib/status';
import type { ContractViewModel } from '@/lib/types';

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_ESCROW_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io/tx/';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as Window & { ethereum?: unknown }).ethereum as { request?: unknown } | undefined;
  if (!candidate || typeof candidate.request !== 'function') return null;
  return candidate as EthereumProvider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureChain(provider: EthereumProvider, expectedChainId: number): Promise<void> {
  const expectedHex = `0x${expectedChainId.toString(16)}`.toLowerCase();
  const current = await provider.request({ method: 'eth_chainId' });
  const currentHex = typeof current === 'string' ? current.toLowerCase() : '';
  if (currentHex === expectedHex) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expectedHex }] });
  } catch (err: unknown) {
    throw new Error(
      `MetaMask is connected to ${currentHex || 'an unknown chain'}. Switch to chain ${expectedChainId} (${expectedHex}) and try again.`
    );
  }
}

async function waitForTransactionReceipt(provider: EthereumProvider, txHash: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  // Polling keeps each backend API call fast; we only call /escrow/funded once the tx is confirmed.
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
    if (receipt && typeof receipt === 'object') {
      const status = (receipt as { status?: unknown }).status;
      const blockNumber = (receipt as { blockNumber?: unknown }).blockNumber;
      if (blockNumber) {
        if (status === '0x0') throw new Error('Escrow funding transaction reverted onchain.');
        return;
      }
    }
    await sleep(2500);
  }

  throw new Error('Timed out waiting for the onchain transaction to confirm.');
}

type ActionNotice = {
  tone: Tone;
  title: string;
  description: string;
  txHash?: string;
};

function ContractsWorkspace() {
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractViewModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [escrowEnabled, setEscrowEnabled] = useState<boolean | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [affirmingId, setAffirmingId] = useState<string | null>(null);
  const [fundingEscrowId, setFundingEscrowId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [error, setError] = useState('');
  const [dealRetryCount, setDealRetryCount] = useState(0);

  const { focus, from } = useMemo(() => parseContractFocus(searchParams), [searchParams]);

  const handleConnect = useCallback((address: string) => {
    setWallet(address || null);
    setNotice(null);
    setError('');
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
    api.health()
      .then((status) => {
        setEscrowEnabled(status.escrow_enabled ?? null);
      })
      .catch(() => {
        setEscrowEnabled(null);
      });
  }, []);

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
    setNotice(null);
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
    setNotice(null);
    try {
      await api.affirmServiceDelivery(contractId);
      await loadContracts();

      // Escrow settlement is async (block times). Poll until we see it released/refunded (or detect a stop condition).
      const startedAt = Date.now();
      setNotice({
        tone: 'info',
        title: 'Work confirmed',
        description: 'Escrow settlement is processing onchain. Waiting for a settlement transaction hash...',
      });
      let finished = false;
      while (Date.now() - startedAt < 120000) {
        await sleep(3500);
        try {
          const escrow = await api.getEscrow(contractId);
          if (escrow.status === 'released' || escrow.status === 'refunded') {
            const txHash = escrow.settle_tx_hash || escrow.refund_tx_hash || undefined;
            setNotice({
              tone: 'success',
              title: 'Escrow settled onchain',
              description: txHash
                ? 'Settlement succeeded. Transaction hash below.'
                : 'Settlement succeeded. Refresh the page if the tx hash is still loading.',
              txHash,
            });
            await loadContracts();
            finished = true;
            break;
          }
          if (escrow.status === 'awaiting_funding') {
            setNotice({
              tone: 'warning',
              title: 'Escrow not funded yet',
              description: 'The payer still needs to fund escrow before onchain release can happen.',
            });
            finished = true;
            break;
          }
          if (escrow.last_error && escrow.last_error.trim()) {
            setNotice({
              tone: 'warning',
              title: 'Escrow settlement needs attention',
              description: escrow.last_error,
            });
            await loadContracts();
            finished = true;
            break;
          }
          if (escrow.status === 'failed') {
            const message = escrow.last_error || 'Escrow settlement failed.';
            setNotice({ tone: 'danger', title: 'Escrow settlement failed', description: message });
            await loadContracts();
            finished = true;
            break;
          }
          // funded/awaiting_funding: keep waiting
        } catch {
          // Escrow may not be prepared yet; stop polling.
          setNotice({
            tone: 'warning',
            title: 'Escrow not prepared yet',
            description: 'Prepare and fund escrow before attempting onchain release.',
          });
          finished = true;
          break;
        }
      }

      if (!finished) {
        setNotice({
          tone: 'info',
          title: 'Escrow settlement pending',
          description: 'Still waiting onchain. Refresh in a moment to see the settlement transaction hash.',
        });
      }
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
    setNotice(null);
    try {
      const prepared = await api.prepareEscrow(contractId);
      const provider = getEthereumProvider();
      if (!provider) {
        throw new Error('MetaMask is required to send escrow funding transaction.');
      }

      await ensureChain(provider, prepared.escrow.chain_id);

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

      setNotice({
        tone: 'success',
        title: 'Escrow funding submitted',
        description: 'Transaction submitted. Waiting for onchain confirmation...',
        txHash,
      });

      // Wait for the tx to confirm before asking the backend to verify and mark it funded.
      await waitForTransactionReceipt(provider, txHash, 180000);

      await api.markEscrowFunded(contractId, txHash);
      setNotice({
        tone: 'success',
        title: 'Escrow funded',
        description: 'Funding confirmed and recorded. The Fund Escrow button should disappear now.',
        txHash,
      });
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

        {escrowEnabled === false ? (
          <InfoCallout
            title="Onchain escrow is disabled"
            description="This backend is not configured to prepare or fund onchain escrow yet. Escrow actions will be hidden until it is enabled."
            tone="warning"
          />
        ) : null}

        {error ? <InfoCallout title="Contract queue warning" description={error} tone="danger" /> : null}
        {notice ? (
          <InfoCallout title={notice.title} description={notice.description} tone={notice.tone}>
            {notice.txHash ? (
              <p>
                Tx:{' '}
                <a
                  className="font-mono underline decoration-dotted underline-offset-2"
                  href={`${EXPLORER_TX_BASE}${notice.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={notice.txHash}
                >
                  {formatWallet(notice.txHash, 12, 10)}
                </a>
              </p>
            ) : null}
          </InfoCallout>
        ) : null}
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
                    escrowEnabled={escrowEnabled}
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
                    escrowEnabled={escrowEnabled}
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
                    escrowEnabled={escrowEnabled}
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
