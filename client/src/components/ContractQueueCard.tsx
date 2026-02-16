'use client';

import Link from 'next/link';
import OfferTermsView from '@/components/OfferTermsView';
import StatusPill from '@/components/StatusPill';
import { buildReadableContractSummary, formatTimestamp, formatWallet } from '@/lib/formatters';
import { contractStatusCopy, verdictStatusCopy } from '@/lib/status';
import type { ContractViewModel } from '@/lib/types';

interface ContractQueueCardProps {
  contract: ContractViewModel;
  highlighted?: boolean;
  walletAddress?: string | null;
  onResolve?: (id: string) => void;
  onAffirmService?: (id: string) => void;
  resolving?: boolean;
  affirming?: boolean;
}

export default function ContractQueueCard({
  contract,
  highlighted = false,
  walletAddress,
  onResolve,
  onAffirmService,
  resolving = false,
  affirming = false,
}: ContractQueueCardProps) {
  const status = contractStatusCopy(contract.status);
  const verdict = verdictStatusCopy(contract.verdict);
  const normalizedWallet = walletAddress?.toLowerCase();
  const isService = contract.deal_type === 'service';
  const receiverWallet = contract.party_a_wallet;
  const providerWallet = contract.party_b_wallet;
  const readableSummary = buildReadableContractSummary(contract.deal_type, contract.summary, contract.terms);
  const canAffirmService = Boolean(
    isService &&
      contract.status === 'active' &&
      onAffirmService &&
      normalizedWallet &&
      normalizedWallet === receiverWallet.toLowerCase()
  );
  const waitingForReceiver = Boolean(
    isService &&
      contract.status === 'active' &&
      normalizedWallet &&
      normalizedWallet !== receiverWallet.toLowerCase()
  );

  return (
    <article
      id={`contract-${contract.id}`}
      className={`card scroll-mt-28 p-5 transition md:p-6 ${highlighted ? 'ring-2 ring-[var(--accent-copper)] shadow-[0_0_0_8px_color-mix(in_srgb,var(--accent-copper),transparent_86%)]' : ''}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={status.label} tone={status.tone} pulse={contract.status === 'pending_resolution'} />
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
              {contract.deal_type}
            </span>
          </div>
          <p className="text-sm text-[var(--muted-ink)]">{status.description}</p>
        </div>

        <div className="text-right text-xs text-[var(--muted-ink)]">
          <p>Created {formatTimestamp(contract.created_at)}</p>
          {contract.resolved_at ? <p>Resolved {formatTimestamp(contract.resolved_at)}</p> : null}
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-[var(--ink)] md:text-base">{readableSummary}</p>

      <div className="mb-4 grid gap-2 rounded-2xl border border-[var(--line)] bg-white/70 p-3 text-xs text-[var(--muted-ink)] md:grid-cols-2">
        <p>
          {isService ? 'Receiver' : 'Party A'}:{' '}
          <span className="font-mono text-[var(--ink)]">{formatWallet(receiverWallet)}</span>
        </p>
        <p>
          {isService ? 'Provider' : 'Party B'}:{' '}
          <span className="font-mono text-[var(--ink)]">{formatWallet(providerWallet)}</span>
        </p>
      </div>

      <OfferTermsView terms={contract.terms} title="Contract Terms" />

      {(contract.verdict || contract.status === 'resolved') && (
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Resolution Verdict</p>
            <StatusPill label={verdict.label} tone={verdict.tone} />
          </div>
          <p className="text-sm text-[var(--muted-ink)]">{verdict.description}</p>
          {contract.verdict_reasoning ? <p className="mt-2 text-sm text-[var(--ink)]">{contract.verdict_reasoning}</p> : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {contract.status === 'pending_resolution' && onResolve ? (
          <button onClick={() => onResolve(contract.id)} disabled={resolving} className="button-primary text-sm" type="button">
            {resolving ? 'Resolving...' : 'Resolve Condition'}
          </button>
        ) : null}

        {canAffirmService ? (
          <button
            onClick={() => onAffirmService?.(contract.id)}
            disabled={affirming}
            className="button-primary text-sm"
            type="button"
          >
            {affirming ? 'Releasing...' : 'Affirm Delivery & Release Escrow'}
          </button>
        ) : null}

        {contract.attestation_id ? (
          <Link href={`/verify?id=${contract.attestation_id}`} className="button-secondary text-sm">
            View Attestation
          </Link>
        ) : null}
      </div>

      {waitingForReceiver ? (
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          Awaiting receiver confirmation before escrow release and attestation.
        </p>
      ) : null}
    </article>
  );
}
