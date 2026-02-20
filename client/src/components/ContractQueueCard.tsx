'use client';

import Link from 'next/link';
import OfferTermsView from '@/components/OfferTermsView';
import StatusPill from '@/components/StatusPill';
import {
  buildReadableContractSummary,
  extractMissingTerms,
  formatMissingTermLabel,
  formatTimestamp,
  formatWeiToEth,
  formatWallet,
} from '@/lib/formatters';
import { contractStatusCopy, verdictStatusCopy } from '@/lib/status';
import type { ContractViewModel, EscrowStatus } from '@/lib/types';

interface ContractQueueCardProps {
  contract: ContractViewModel;
  highlighted?: boolean;
  walletAddress?: string | null;
  escrowEnabled?: boolean | null;
  onResolve?: (id: string) => void;
  onAffirmService?: (id: string) => void;
  onFundEscrow?: (id: string) => void;
  resolving?: boolean;
  affirming?: boolean;
  fundingEscrow?: boolean;
}

const EXPLORER_TX_BASE = process.env.NEXT_PUBLIC_ESCROW_EXPLORER_BASE_URL || 'https://sepolia.etherscan.io/tx/';

function escrowStatusCopy(params: {
  status?: EscrowStatus;
  escrowEnabled?: boolean | null;
  settlementPending?: boolean;
  viewerIsProvider?: boolean;
}): string {
  const { status, escrowEnabled, settlementPending = false, viewerIsProvider = false } = params;
  if (escrowEnabled === false) {
    return 'Onchain escrow is not enabled on this backend.';
  }
  if (settlementPending) {
    if (viewerIsProvider) {
      return 'Escrow pending settlement. Work is affirmed and payout to provider is processing onchain.';
    }
    return 'Escrow pending settlement. Work is affirmed and settlement is processing onchain.';
  }
  switch (status) {
    case 'awaiting_funding':
      return 'Awaiting payer funding onchain.';
    case 'funded':
      return 'Escrow funded onchain and waiting for verdict-triggered settlement.';
    case 'released':
      return 'Escrow released to the service provider / true recipient.';
    case 'refunded':
      return 'Escrow refunded (false verdict or timeout).';
    case 'failed':
      return 'Escrow action failed. Retry funding or settlement.';
    default:
      return 'Escrow not prepared yet.';
  }
}

function isDigits(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value.trim());
}

function formatEthAmountText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d{1,18})?$/.test(text)) return null;
  return `${text} ETH`;
}

function deriveLockedEscrowAmount(
  termsRecord: Record<string, unknown>,
  agreedTerms: Record<string, unknown>,
  escrowAmountWei?: string | null
): string {
  if (escrowAmountWei) {
    return formatWeiToEth(escrowAmountWei);
  }

  const weiCandidates = [
    agreedTerms.amount_wei,
    agreedTerms.escrow_amount_wei,
    termsRecord.amount_wei,
    termsRecord.escrow_amount_wei,
  ];
  for (const candidate of weiCandidates) {
    if (isDigits(candidate)) {
      return formatWeiToEth(candidate);
    }
  }

  const ethCandidates = [
    agreedTerms.escrow_eth,
    agreedTerms.amount_eth,
    termsRecord.escrow_eth,
    termsRecord.amount_eth,
  ];
  for (const candidate of ethCandidates) {
    const formatted = formatEthAmountText(candidate);
    if (formatted) return formatted;
  }

  const currency = String(agreedTerms.currency || termsRecord.currency || '').trim().toUpperCase();
  if (currency === 'ETH') {
    const numeric = agreedTerms.price_amount ?? agreedTerms.amount ?? termsRecord.amount ?? termsRecord.price;
    const formatted = formatEthAmountText(numeric);
    if (formatted) return formatted;
  }

  return 'Not locked yet';
}

export default function ContractQueueCard({
  contract,
  highlighted = false,
  walletAddress,
  escrowEnabled = null,
  onResolve,
  onAffirmService,
  onFundEscrow,
  resolving = false,
  affirming = false,
  fundingEscrow = false,
}: ContractQueueCardProps) {
  const termsRecord = (contract.terms && typeof contract.terms === 'object' && !Array.isArray(contract.terms))
    ? (contract.terms as Record<string, unknown>)
    : {};
  const agreedTerms = (termsRecord.agreed_terms && typeof termsRecord.agreed_terms === 'object' && !Array.isArray(termsRecord.agreed_terms))
    ? (termsRecord.agreed_terms as Record<string, unknown>)
    : {};
  const status = contractStatusCopy(contract.status);
  const verdict = verdictStatusCopy(contract.verdict);
  const normalizedWallet = walletAddress?.toLowerCase();
  const isService = contract.deal_type === 'service';
  const explicitReceiver = [
    agreedTerms.receiver_wallet,
    agreedTerms.client_wallet,
    agreedTerms.buyer_wallet,
    agreedTerms.requester_wallet,
    termsRecord.receiver_wallet,
    termsRecord.client_wallet,
    termsRecord.buyer_wallet,
    termsRecord.requester_wallet,
  ].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  const receiverWallet = explicitReceiver || contract.party_a_wallet;
  const providerWallet =
    receiverWallet.toLowerCase() === contract.party_a_wallet.toLowerCase()
      ? contract.party_b_wallet
      : contract.party_a_wallet;
  const missingTerms = extractMissingTerms(contract.terms);
  const readableSummary = buildReadableContractSummary(contract.deal_type, contract.summary, contract.terms);
  const escrow = contract.escrow;
  const lockedEscrowAmount = deriveLockedEscrowAmount(termsRecord, agreedTerms, escrow?.amount_wei);
  const verifyAttestationId = contract.status === 'resolved'
    ? (contract.attestation_id || escrow?.attestation_id || null)
    : (escrow?.attestation_id || contract.attestation_id || null);
  const inferredPayerWallet = (
    [agreedTerms.payer_wallet, agreedTerms.client_wallet, agreedTerms.buyer_wallet, agreedTerms.requester_wallet, termsRecord.payer_wallet, contract.party_a_wallet]
      .find((value) => typeof value === 'string' && value.trim()) as string | undefined
  ) || contract.party_a_wallet;
  const payerWallet = escrow?.payer_wallet || inferredPayerWallet;
  const releaseRecipientWallet = escrow?.recipient_if_true_wallet || providerWallet;
  const refundRecipientWallet = escrow?.recipient_if_false_wallet || payerWallet;
  const isProviderViewer = Boolean(
    normalizedWallet &&
      releaseRecipientWallet &&
      normalizedWallet === releaseRecipientWallet.toLowerCase()
  );
  const escrowSettlementPending = Boolean(
    escrow?.status === 'funded' &&
      contract.status === 'resolved' &&
      !escrow?.settle_tx_hash &&
      !escrow?.refund_tx_hash
  );
  const escrowNeedsFunding = Boolean(!escrow || escrow.status === 'awaiting_funding' || (escrow.status === 'failed' && !escrow.fund_tx_hash));
  const payerCanFundEscrow = Boolean(
    onFundEscrow &&
      escrowEnabled !== false &&
      normalizedWallet &&
      payerWallet &&
      normalizedWallet === payerWallet.toLowerCase() &&
      escrowNeedsFunding
  );
  const escrowFundingCta = !escrow ? 'Prepare & Fund Escrow' : escrow.status === 'failed' ? 'Retry Escrow Funding' : 'Fund Escrow';
  const settlementTxHash = escrow?.settle_tx_hash || escrow?.refund_tx_hash;
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
      className={`card scroll-mt-28 p-5 transition md:p-6 ${highlighted ? 'ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_8px_color-mix(in_srgb,var(--accent-gold),transparent_88%)]' : ''}`}
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

      <div className="mb-4 grid gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-3)] p-3 text-xs text-[var(--muted-ink)] md:grid-cols-2">
        <p>
          {isService ? 'Receives Service' : 'Party A'}:{' '}
          <span className="font-mono text-[var(--ink)]">{formatWallet(receiverWallet)}</span>
        </p>
        <p>
          {isService ? 'Provides Service' : 'Party B'}:{' '}
          <span className="font-mono text-[var(--ink)]">{formatWallet(providerWallet)}</span>
        </p>
      </div>

      <OfferTermsView terms={contract.terms} title="What Both Sides Agreed" />

      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Escrow Status</p>
        <p className="mt-1 text-sm text-[var(--ink)]">
          {escrowStatusCopy({
            status: escrow?.status,
            escrowEnabled,
            settlementPending: escrowSettlementPending,
            viewerIsProvider: isProviderViewer,
          })}
        </p>
        <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
            Payer: <span className="font-mono text-[var(--ink)]">{formatWallet(payerWallet)}</span>
          </p>
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
            Release to provider: <span className="font-mono text-[var(--ink)]">{formatWallet(releaseRecipientWallet)}</span>
          </p>
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
            Refund back to payer: <span className="font-mono text-[var(--ink)]">{formatWallet(refundRecipientWallet)}</span>
          </p>
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
            Locked At Agreement: <span className="font-semibold text-[var(--ink)]">{lockedEscrowAmount}</span>
          </p>
          {escrow?.fund_tx_hash ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 md:col-span-2">
              Funding tx:{' '}
              <a
                href={`${EXPLORER_TX_BASE}${escrow.fund_tx_hash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--ink)] underline decoration-dotted underline-offset-2"
              >
                {formatWallet(escrow.fund_tx_hash, 10, 8)}
              </a>
            </p>
          ) : null}
          {settlementTxHash ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 md:col-span-2">
              Settlement tx:{' '}
              <a
                href={`${EXPLORER_TX_BASE}${settlementTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--ink)] underline decoration-dotted underline-offset-2"
              >
                {formatWallet(settlementTxHash, 10, 8)}
              </a>
            </p>
          ) : null}
        </div>
        {escrow?.last_error && escrow.status !== 'released' && escrow.status !== 'refunded' ? (
          <p className="mt-2 text-xs text-[var(--danger)]">Latest escrow error: {escrow.last_error}</p>
        ) : null}
      </div>

      {missingTerms.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-2),var(--warning)_15%)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Missing Or Unclear Terms</p>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {missingTerms.map((term) => formatMissingTermLabel(term)).join(', ')}
          </p>
        </div>
      ) : null}

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
        {payerCanFundEscrow ? (
          <button
            onClick={() => onFundEscrow?.(contract.id)}
            disabled={fundingEscrow}
            className="button-primary text-sm"
            type="button"
          >
            {fundingEscrow ? 'Funding Escrow...' : escrowFundingCta}
          </button>
        ) : null}

        {contract.status === 'pending_resolution' && onResolve ? (
          <button onClick={() => onResolve(contract.id)} disabled={resolving} className="button-primary text-sm" type="button">
            {resolving ? 'Running check...' : 'Run Condition Check'}
          </button>
        ) : null}

        {canAffirmService ? (
          <button
            onClick={() => onAffirmService?.(contract.id)}
            disabled={affirming}
            className="button-primary text-sm"
            type="button"
          >
            {affirming ? 'Confirming...' : 'Confirm Work Received & Release Escrow'}
          </button>
        ) : null}

        {verifyAttestationId ? (
          <Link href={`/verify?id=${verifyAttestationId}`} className="button-secondary text-sm">
            Verify Proof
          </Link>
        ) : null}
      </div>

      {waitingForReceiver ? (
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          Waiting for the receiver to confirm completion before escrow release.
        </p>
      ) : null}
    </article>
  );
}
