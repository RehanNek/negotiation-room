'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';
import { formatTimestamp } from '@/lib/formatters';
import { inferAttestationVerdict, verdictStatusCopy } from '@/lib/status';
import type { AttestationVerification, ConditionVerdict } from '@/lib/types';

function compactId(value: string, start: number = 12, end: number = 8): string {
  if (!value) return value;
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_ESCROW_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io/tx/';

function extractOnchainEvidence(payload: Record<string, unknown> | undefined): {
  chainId?: string;
  fundTx?: string;
  settleTx?: string;
  refundTx?: string;
  contractAddress?: string;
} {
  if (!payload) return {};

  const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const asId = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
  };
  const isTxHash = (value: unknown): value is string =>
    typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);

  const chainId = asId(payload.chain_id) || asId(payload.chainId);
  const fundTx = isTxHash(payload.fund_tx_hash) ? payload.fund_tx_hash : undefined;
  const settleTx = isTxHash(payload.settle_tx_hash) ? payload.settle_tx_hash : undefined;
  const refundTx = isTxHash(payload.refund_tx_hash) ? payload.refund_tx_hash : undefined;
  const genericTx = isTxHash(payload.tx_hash) ? payload.tx_hash : undefined;
  const status = asString(payload.status);
  const action = asString(payload.action);
  const contractAddress = asString(payload.contract_address);

  return {
    chainId,
    fundTx: fundTx || (status === 'funded' ? genericTx : undefined),
    settleTx: settleTx || (status === 'released' || action === 'escrow_settled' ? genericTx : undefined),
    refundTx: refundTx || (status === 'refunded' || action === 'escrow_refunded_timeout' ? genericTx : undefined),
    contractAddress,
  };
}

function VerifyWorkspace() {
  const searchParams = useSearchParams();
  const [attestationId, setAttestationId] = useState(searchParams.get('id') || '');
  const [result, setResult] = useState<AttestationVerification | null>(null);
  const [resolvedFromContract, setResolvedFromContract] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    setAttestationId(id);
    void verify(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function verify(id?: string) {
    const target = (id || attestationId).trim();
    if (!target) return;

    setLoading(true);
    setError('');
    setResult(null);
    setResolvedFromContract(null);
    setShowTechnical(false);

    try {
      const verification = await api.verifyAttestation(target);
      setResult(verification);
      setLoading(false);
      return;
    } catch {
      // Fallback path: user may have provided a contract id.
    }

    try {
      const contract = await api.getContract(target);
      if (!contract.attestation_id) {
        throw new Error('No backend attestation exists for this contract yet.');
      }

      const verification = await api.verifyAttestation(contract.attestation_id);
      setAttestationId(contract.attestation_id);
      setResolvedFromContract(contract.id);
      setResult(verification);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attestation not found or invalid');
    } finally {
      setLoading(false);
    }
  }

  const normalizedVerdict: ConditionVerdict | undefined = inferAttestationVerdict(result?.attestation);
  const verdictCopy = verdictStatusCopy(normalizedVerdict);
  const onchain = extractOnchainEvidence(result?.attestation?.payload);

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div>
          <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Verify Proof</h1>
          <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
            Check that this contract record is authentic and has not been changed since it was created inside the secure environment.
          </p>
        </div>

        <InfoCallout
          title="How to read this page"
          description="If status is valid, the record is intact. Then review the linked contract id and outcome snapshot. Technical fields are optional and can be expanded when needed."
          tone="info"
        />

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={attestationId}
            onChange={(event) => setAttestationId(event.target.value)}
            placeholder="Paste proof id or contract id"
            className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 font-mono text-sm text-[var(--ink)]"
          />
          <button className="button-primary" onClick={() => void verify()} disabled={loading || !attestationId.trim()} type="button">
            {loading ? 'Checking...' : 'Check Proof'}
          </button>
        </div>

        {error ? <InfoCallout title="Could not verify this proof" description={error} tone="danger" /> : null}
        {resolvedFromContract ? (
          <InfoCallout
            title="Loaded from contract id"
            description={`Found proof attached to contract ${resolvedFromContract}.`}
            tone="info"
          />
        ) : null}
      </section>

      {result ? (
        <section className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
          <EvidencePanel
            title={result.valid ? 'Proof Check Passed' : 'Proof Check Failed'}
            subtitle={
              result.valid
                ? 'This record matches its integrity signature.'
                : 'This record does not match its integrity signature.'
            }
          >
            <div className="mb-2">
              <StatusPill label={result.valid ? 'Proof Valid' : 'Proof Invalid'} tone={result.valid ? 'success' : 'danger'} pulse={result.valid} />
            </div>

            <div className="grid gap-2 text-xs md:grid-cols-2">
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                Record type: <span className="font-semibold text-[var(--ink)]">{result.attestation.type}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                Recorded at: <span className="font-semibold text-[var(--ink)]">{formatTimestamp(result.attestation.created_at)}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 md:col-span-2">
                Linked contract:{' '}
                <span className="font-mono text-[var(--ink)]" title={result.attestation.contract_id}>
                  {compactId(result.attestation.contract_id)}
                </span>
              </p>
            </div>

            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => setShowTechnical((value) => !value)}
            >
              {showTechnical ? 'Hide Technical Details' : 'Show Technical Details'}
            </button>

            {showTechnical ? (
              <div className="space-y-3">
                <div className="grid gap-2 text-xs">
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                    Integrity hash:{' '}
                    <span className="break-all font-mono text-[var(--ink)]">{result.attestation.data_hash}</span>
                  </p>
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                    TEE signature:{' '}
                    <span className="break-all font-mono text-[var(--ink)]">{result.attestation.tee_signature}</span>
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-white/75 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Raw payload (technical audit view)
                  </p>
                  <pre className="max-h-80 overflow-auto rounded-xl bg-[var(--surface-3)] p-3 text-xs text-[var(--ink)]">
                    {JSON.stringify(result.attestation.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </EvidencePanel>

          <div className="space-y-4">
            <InfoCallout
              title="What this confirms"
              description="The saved record is intact and matches the secure attestation signature."
              tone="success"
            />
            <InfoCallout
              title="What this does not confirm"
              description="This does not prove legal enforcement or real-world payment transfer by itself. It only proves record integrity."
              tone="warning"
            />
            {(onchain.fundTx || onchain.settleTx || onchain.refundTx) ? (
              <InfoCallout
                title="Onchain settlement evidence"
                description="These transaction links are the chain-side evidence for escrow funding and settlement actions."
                tone="info"
              >
                <div className="space-y-1 text-xs text-[var(--ink)]">
                  {onchain.chainId ? <p>Chain ID: <span className="font-semibold">{onchain.chainId}</span></p> : null}
                  {onchain.contractAddress ? <p>Escrow contract: <span className="font-mono">{compactId(onchain.contractAddress, 10, 8)}</span></p> : null}
                  {onchain.fundTx ? (
                    <p>
                      Funding tx:{' '}
                      <a className="underline decoration-dotted underline-offset-2" href={`${EXPLORER_TX_BASE}${onchain.fundTx}`} target="_blank" rel="noreferrer">
                        {compactId(onchain.fundTx, 10, 8)}
                      </a>
                    </p>
                  ) : null}
                  {onchain.settleTx ? (
                    <p>
                      Settlement tx:{' '}
                      <a className="underline decoration-dotted underline-offset-2" href={`${EXPLORER_TX_BASE}${onchain.settleTx}`} target="_blank" rel="noreferrer">
                        {compactId(onchain.settleTx, 10, 8)}
                      </a>
                    </p>
                  ) : null}
                  {onchain.refundTx ? (
                    <p>
                      Refund tx:{' '}
                      <a className="underline decoration-dotted underline-offset-2" href={`${EXPLORER_TX_BASE}${onchain.refundTx}`} target="_blank" rel="noreferrer">
                        {compactId(onchain.refundTx, 10, 8)}
                      </a>
                    </p>
                  ) : null}
                </div>
              </InfoCallout>
            ) : null}
            <InfoCallout title="Current outcome state" description={verdictCopy.description} tone={verdictCopy.tone}>
              <StatusPill label={verdictCopy.label} tone={verdictCopy.tone} />
            </InfoCallout>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<section className="card p-6 text-sm text-[var(--muted-ink)]">Loading verification workspace...</section>}>
      <VerifyWorkspace />
    </Suspense>
  );
}
