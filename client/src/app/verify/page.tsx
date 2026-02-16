'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';
import { formatTimestamp } from '@/lib/formatters';
import { verdictStatusCopy } from '@/lib/status';
import type { AttestationVerification, ConditionVerdict } from '@/lib/types';

function VerifyWorkspace() {
  const searchParams = useSearchParams();
  const [attestationId, setAttestationId] = useState(searchParams.get('id') || '');
  const [result, setResult] = useState<AttestationVerification | null>(null);
  const [resolvedFromContract, setResolvedFromContract] = useState<string | null>(null);
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

  const verdict = result?.attestation?.payload?.verdict;
  const normalizedVerdict: ConditionVerdict | undefined =
    verdict === 'TRUE' || verdict === 'FALSE' ? verdict : undefined;
  const verdictCopy = verdictStatusCopy(normalizedVerdict);

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div>
          <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Attestation Verification</h1>
          <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
            Confirm what code path executed, what payload was hashed, and whether the verification signature remains consistent.
          </p>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={attestationId}
            onChange={(event) => setAttestationId(event.target.value)}
            placeholder="Paste attestation id or contract id"
            className="w-full rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2 font-mono text-sm text-[var(--ink)]"
          />
          <button className="button-primary" onClick={() => void verify()} disabled={loading || !attestationId.trim()} type="button">
            {loading ? 'Verifying...' : 'Verify Proof'}
          </button>
        </div>

        {error ? <InfoCallout title="Verification failed" description={error} tone="danger" /> : null}
        {resolvedFromContract ? (
          <InfoCallout
            title="Resolved from contract id"
            description={`Loaded backend attestation from contract ${resolvedFromContract}.`}
            tone="info"
          />
        ) : null}
      </section>

      {result ? (
        <section className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
          <EvidencePanel
            title={result.valid ? 'Attestation Is Valid' : 'Attestation Is Invalid'}
            subtitle={
              result.valid
                ? 'Payload hash and signature match stored attestation records.'
                : 'Signature or payload integrity check failed.'
            }
          >
            <div className="mb-2">
              <StatusPill label={result.valid ? 'Valid Proof' : 'Invalid Proof'} tone={result.valid ? 'success' : 'danger'} pulse={result.valid} />
            </div>

            <div className="grid gap-2 text-xs md:grid-cols-2">
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                Type: <span className="font-semibold text-[var(--ink)]">{result.attestation.type}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                Created: <span className="font-semibold text-[var(--ink)]">{formatTimestamp(result.attestation.created_at)}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 md:col-span-2">
                Contract: <span className="font-mono text-[var(--ink)]">{result.attestation.contract_id}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 md:col-span-2">
                Hash: <span className="break-all font-mono text-[var(--ink)]">{result.attestation.data_hash}</span>
              </p>
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 md:col-span-2">
                Signature: <span className="break-all font-mono text-[var(--ink)]">{result.attestation.tee_signature}</span>
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-white/75 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Payload</p>
              <pre className="max-h-80 overflow-auto rounded-xl bg-[var(--surface-3)] p-3 text-xs text-[var(--ink)]">
                {JSON.stringify(result.attestation.payload, null, 2)}
              </pre>
            </div>
          </EvidencePanel>

          <div className="space-y-4">
            <InfoCallout
              title="What this proves"
              description="The attested payload has not changed since signature generation and can be independently verified."
              tone="success"
            />
            <InfoCallout
              title="What this does not prove"
              description="This check does not enforce legal settlement or off-chain payment finality. It validates process integrity."
              tone="warning"
            />
            <InfoCallout title="Verdict snapshot" description={verdictCopy.description} tone={verdictCopy.tone}>
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
