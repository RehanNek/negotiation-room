'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InfoCallout from '@/components/InfoCallout';
import OfferTermsView from '@/components/OfferTermsView';
import StatusPill from '@/components/StatusPill';
import { api } from '@/lib/api';
import { formatTimestamp, formatWallet, summarizeOfferTerms } from '@/lib/formatters';
import { negotiationStatusCopy } from '@/lib/status';
import type { NegotiationStatus, NegotiationSuggestion, NegotiationViewModel, RoundViewModel } from '@/lib/types';

export interface NegotiationCompletion {
  status: NegotiationStatus;
  negotiationId: string;
  contractId?: string;
}

interface NegotiationRoomProps {
  negotiationId: string;
  walletAddress: string;
  onComplete?: (completion: NegotiationCompletion) => void;
}

function extractMessageValue(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        const nested = extractMessageValue(parsed);
        if (nested) return nested;
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => extractMessageValue(item))
      .filter((item): item is string => Boolean(item && item.trim()));
    return parts.length > 0 ? parts.join(', ') : null;
  }

  const record = payload as Record<string, unknown>;
  const directText = [record.message, record.raw, record.text, record.content].find(
    (value) => typeof value === 'string' && value.trim()
  ) as string | undefined;
  if (directText) return directText;

  const scalarEntries = Object.entries(record)
    .filter(([, value]) => {
      const valueType = typeof value;
      return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
    })
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);

  if (scalarEntries.length > 0) {
    return scalarEntries.join('\n');
  }

  return null;
}

function roundToMessage(round: RoundViewModel): string {
  const rawMessage = extractMessageValue(round.offer_raw);
  if (rawMessage) {
    return rawMessage;
  }
  const structuredMessage = extractMessageValue(round.offer_structured);
  if (structuredMessage) {
    return structuredMessage;
  }

  const summary = summarizeOfferTerms(round.offer_structured);
  if (summary.length === 0) {
    return 'Shared structured offer terms.';
  }
  return summary.map((item) => `${item.label}: ${item.value}`).join('\n');
}

function orientSuggestionForRole(text: string, role: 'A' | 'B'): string {
  if (!text.trim()) return text;
  if (role === 'A') {
    return text
      .replace(/\bparty a\b/gi, 'you')
      .replace(/\bparty b\b/gi, 'counterparty');
  }
  return text
    .replace(/\bparty b\b/gi, 'you')
    .replace(/\bparty a\b/gi, 'counterparty');
}

function normalizeSuggestionText(input: unknown): string {
  if (typeof input === 'string') {
    const cleaned = input.trim();
    return cleaned || 'No suggestion generated for this deal room.';
  }

  if (!input || typeof input !== 'object') {
    return 'No suggestion generated for this deal room.';
  }

  const record = input as Record<string, unknown>;
  const nested = [record.suggestion, record.message, record.text, record.content].find(
    (value) => typeof value === 'string' && value.trim()
  ) as string | undefined;

  if (nested) return nested.trim();
  return 'No suggestion generated for this deal room.';
}

function loadStoredPrivateInputs(negotiationId: string, walletAddress: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const key = `private_inputs:${negotiationId}:${walletAddress.toLowerCase()}`;
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const ETH_WEI_BASE = BigInt('1000000000000000000');
const BIGINT_ZERO = BigInt(0);

function parseEthToWei(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(?:\.\d{1,18})?$/.test(trimmed)) return null;

  const [wholePartRaw, fractionalRaw = ''] = trimmed.split('.');
  const wholePart = BigInt(wholePartRaw || '0');
  const fractionalPadded = `${fractionalRaw}000000000000000000`.slice(0, 18);
  const fractionalPart = BigInt(fractionalPadded || '0');
  return wholePart * ETH_WEI_BASE + fractionalPart;
}

function formatWeiAsEth(wei: bigint): string {
  const whole = wei / ETH_WEI_BASE;
  const fractional = wei % ETH_WEI_BASE;
  if (fractional === BIGINT_ZERO) return whole.toString();
  const fractionalText = fractional.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionalText}`;
}

function normalizeEscrowAmountInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const wei = parseEthToWei(trimmed);
  if (wei === null || wei <= BIGINT_ZERO) return null;
  return formatWeiAsEth(wei);
}

function prefillEscrowAmountFromTerms(terms: Record<string, unknown> | null | undefined): string | null {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return null;
  const root = terms as Record<string, unknown>;
  const agreed = root.agreed_terms && typeof root.agreed_terms === 'object' && !Array.isArray(root.agreed_terms)
    ? (root.agreed_terms as Record<string, unknown>)
    : {};

  const weiCandidates = [
    agreed.amount_wei,
    agreed.escrow_amount_wei,
    root.amount_wei,
    root.escrow_amount_wei,
  ];
  for (const candidate of weiCandidates) {
    if (typeof candidate === 'string' && /^\d+$/.test(candidate.trim())) {
      const wei = BigInt(candidate.trim());
      if (wei > BIGINT_ZERO) return formatWeiAsEth(wei);
    }
  }

  const ethCandidates = [
    agreed.escrow_eth,
    agreed.amount_eth,
    root.escrow_eth,
    root.amount_eth,
  ];
  for (const candidate of ethCandidates) {
    if (candidate === null || candidate === undefined) continue;
    const normalized = normalizeEscrowAmountInput(String(candidate));
    if (normalized) return normalized;
  }

  return null;
}

export default function NegotiationRoom({ negotiationId, walletAddress, onComplete }: NegotiationRoomProps) {
  const [negotiation, setNegotiation] = useState<NegotiationViewModel | null>(null);
  const [offer, setOffer] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneAmountEth, setDoneAmountEth] = useState('');
  const [doneTimeline, setDoneTimeline] = useState('');
  const [doneDeliverables, setDoneDeliverables] = useState('');
  const [doneNotes, setDoneNotes] = useState('');
  const [doneError, setDoneError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [pendingTermsHash, setPendingTermsHash] = useState<string | null>(null);
  const [pendingTermsDraft, setPendingTermsDraft] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<NegotiationSuggestion | null>(null);
  const [shareFeedback, setShareFeedback] = useState('');
  const completionNotified = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    completionNotified.current = false;
  }, [negotiationId, walletAddress]);

  useEffect(() => {
    setDoneOpen(false);
    setDoneAmountEth('');
    setDoneTimeline('');
    setDoneDeliverables('');
    setDoneNotes('');
    setDoneError('');
  }, [negotiationId, walletAddress]);

  const notifyCompletion = useCallback(
    (status: NegotiationStatus, contractId?: string) => {
      if (completionNotified.current) return;
      completionNotified.current = true;
      onComplete?.({ status, negotiationId, contractId });
    },
    [negotiationId, onComplete]
  );

  const resolveContractIdForNegotiation = useCallback(async (): Promise<string | undefined> => {
    try {
      const contracts = await api.getContractsByWallet(walletAddress);
      const match = contracts
        .filter((contract) => contract.negotiation_id === negotiationId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      return match?.id;
    } catch {
      return undefined;
    }
  }, [negotiationId, walletAddress]);

  const poll = useCallback(async () => {
    try {
      const status = await api.getNegotiationStatus(negotiationId);
      setNegotiation(status);
      if (status.status === 'deal') {
        const contractId = await resolveContractIdForNegotiation();
        if (contractId) {
          notifyCompletion('deal', contractId);
        }
        return;
      }
      if (status.status === 'impasse' || status.status === 'no_deal') {
        notifyCompletion(status.status);
      }
    } catch (err) {
      console.error('Negotiation poll failed:', err);
    }
  }, [negotiationId, notifyCompletion, resolveContractIdForNegotiation]);

  useEffect(() => {
    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [negotiation?.rounds.length, negotiation?.status]);

  const role = useMemo<'A' | 'B'>(() => {
    if (!negotiation) return 'B';
    return walletAddress === negotiation.party_a_wallet ? 'A' : 'B';
  }, [negotiation, walletAddress]);

  const isSelfNegotiation = useMemo(
    () => Boolean(negotiation && negotiation.party_a_wallet.toLowerCase() === (negotiation.party_b_wallet || '').toLowerCase()),
    [negotiation]
  );

  const statusCopy = negotiation ? negotiationStatusCopy(negotiation.status) : null;

  const counterpartyWallet = useMemo(() => {
    if (!negotiation) return null;
    return role === 'A' ? negotiation.party_b_wallet : negotiation.party_a_wallet;
  }, [negotiation, role]);

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') {
      return `/negotiate?room=${encodeURIComponent(negotiationId)}`;
    }
    return `${window.location.origin}/negotiate?room=${encodeURIComponent(negotiationId)}`;
  }, [negotiationId]);

  const inviteMessage = useMemo(
    () => [
      'Join my private deal room.',
      '',
      `Room code: ${negotiationId}`,
      `Join link: ${inviteLink}`,
    ].join('\n'),
    [inviteLink, negotiationId]
  );

  const storedPrivateInputs = useMemo(
    () => loadStoredPrivateInputs(negotiationId, walletAddress),
    [negotiationId, walletAddress]
  );

  useEffect(() => {
    const constraints = negotiation?.private_constraints;
    if (!constraints || Object.keys(constraints).length === 0) return;
    const key = `private_inputs:${negotiationId}:${walletAddress.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify(constraints));
  }, [negotiation?.private_constraints, negotiationId, walletAddress]);

  useEffect(() => {
    if (!negotiation) return;

    const serverTermsHash = negotiation.final_terms_hash || null;
    if (!serverTermsHash) {
      setPendingTermsHash(null);
      setPendingTermsDraft(null);
      return;
    }

    setPendingTermsHash(serverTermsHash);
    if (negotiation.final_terms_draft && typeof negotiation.final_terms_draft === 'object') {
      setPendingTermsDraft(negotiation.final_terms_draft as Record<string, unknown>);
    }
  }, [negotiation]);

  function showShareFeedback(message: string) {
    setShareFeedback(message);
    window.setTimeout(() => {
      setShareFeedback('');
    }, 2200);
  }

  async function shareInvite() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join my deal room',
          text: inviteMessage,
          url: inviteLink,
        });
        showShareFeedback('Invite shared.');
        return;
      } catch {
        // fall through to clipboard fallback
      }
    }

    try {
      await navigator.clipboard.writeText(inviteMessage);
      showShareFeedback('Share sheet unavailable. Invite copied with room code and link.');
    } catch {
      showShareFeedback('Unable to copy invite details on this device.');
    }
  }

  async function handleSubmitOffer() {
    if (!offer.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const result = await api.submitOffer({
        negotiation_id: negotiationId,
        offer: offer.trim(),
      });

      if (result.suggestion) {
        setSuggestion({
          ...result.suggestion,
          suggestion: orientSuggestionForRole(normalizeSuggestionText(result.suggestion.suggestion), role),
        });
      } else {
        setSuggestion(null);
      }
      setOffer('');
      setPendingTermsHash(null);
      setPendingTermsDraft(null);
      await poll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit offer');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDone() {
    const normalizedAmountEth = normalizeEscrowAmountInput(doneAmountEth);
    if (!normalizedAmountEth) {
      setDoneError('Amount is required. Enter a valid amount in ETH.');
      return;
    }

    setMarkingDone(true);
    setError('');
    setDoneError('');
    try {
      setDoneAmountEth(normalizedAmountEth);
      const result = await api.completeNegotiation({
        negotiation_id: negotiationId,
        terms_hash: negotiation?.final_terms_hash || pendingTermsHash || undefined,
        escrow_amount_eth: normalizedAmountEth,
        timeline: doneTimeline.trim() ? doneTimeline.trim() : undefined,
        deliverables: doneDeliverables.trim() ? doneDeliverables.trim() : undefined,
        notes: doneNotes.trim() ? doneNotes.trim() : undefined,
      });

      setDoneOpen(false);

      if (result.status === 'awaiting_other_party_confirmation') {
        setPendingTermsHash(result.terms_hash);
        setPendingTermsDraft(result.terms_draft);
        await poll();
        return;
      }

      await poll();
      notifyCompletion('deal', result.contract?.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to finalize deal room';
      setDoneError(message);
    } finally {
      setMarkingDone(false);
    }
  }

  async function handleWalkAway() {
    setError('');
    try {
      const result = await api.walkAway({ negotiation_id: negotiationId });
      await poll();
      notifyCompletion((result.status as NegotiationStatus) || 'no_deal');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to walk away');
    }
  }

  if (!negotiation || !statusCopy) {
    return <div className="card animate-pulse p-5 text-sm text-[var(--muted-ink)]">Loading deal room...</div>;
  }

  const canSendMessage = negotiation.status === 'active';
  const counterpartyLabel = counterpartyWallet
    ? counterpartyWallet.toLowerCase() === walletAddress.toLowerCase()
      ? 'Counterparty'
      : formatWallet(counterpartyWallet)
    : 'Awaiting participant';
  const serverPrivateInputs = negotiation.private_constraints || {};
  const myPrivateInputs = Object.keys(serverPrivateInputs).length > 0
    ? serverPrivateInputs
    : storedPrivateInputs;
  const hasPrivateInputs = Object.keys(myPrivateInputs).length > 0;
  const termsHash = negotiation.final_terms_hash || pendingTermsHash;
  const termsDraft = (negotiation.final_terms_draft as Record<string, unknown> | null | undefined) || pendingTermsDraft;
  const partyAConfirmed = Boolean(
    termsHash &&
      negotiation.party_a_confirmed_terms_hash &&
      negotiation.party_a_confirmed_terms_hash === termsHash
  );
  const partyBConfirmed = Boolean(
    termsHash &&
      negotiation.party_b_confirmed_terms_hash &&
      negotiation.party_b_confirmed_terms_hash === termsHash
  );
  const myConfirmed = role === 'A' ? partyAConfirmed : partyBConfirmed;
  const otherConfirmed = role === 'A' ? partyBConfirmed : partyAConfirmed;
  const doneButtonLabel = myConfirmed && !otherConfirmed ? 'Done (waiting)' : 'Done';

  function openDoneModal() {
    setError('');
    setDoneError('');

    const agreement = termsDraft && typeof termsDraft === 'object' && !Array.isArray(termsDraft)
      ? (termsDraft as Record<string, unknown>).agreement
      : null;
    const agreementRecord = agreement && typeof agreement === 'object' && !Array.isArray(agreement)
      ? (agreement as Record<string, unknown>)
      : null;

    const prefilledAmount = agreementRecord && typeof agreementRecord.amount_eth === 'string'
      ? agreementRecord.amount_eth
      : prefillEscrowAmountFromTerms(termsDraft);
    if (prefilledAmount) {
      setDoneAmountEth(prefilledAmount);
    }

    const deliverablesPrefill = agreementRecord?.deliverables ?? (termsDraft as any)?.agreed_terms?.deliverables;
    if (typeof deliverablesPrefill === 'string' && deliverablesPrefill.trim()) {
      setDoneDeliverables(deliverablesPrefill.trim());
    }

    const timelinePrefill = agreementRecord?.timeline ?? (termsDraft as any)?.agreed_terms?.timeline ?? (termsDraft as any)?.agreed_terms?.schedule;
    if (typeof timelinePrefill === 'string' && timelinePrefill.trim()) {
      setDoneTimeline(timelinePrefill.trim());
    }

    const notesPrefill = agreementRecord?.notes;
    if (typeof notesPrefill === 'string' && notesPrefill.trim()) {
      setDoneNotes(notesPrefill.trim());
    }

    setDoneOpen(true);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.75fr_1fr]">
      <article className="card overflow-hidden p-0">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--ink)]">
              {counterpartyWallet ? 'C' : '?'}
            </div>
            <div>
              <h2 className="font-display text-2xl text-[var(--ink)] md:text-3xl">{negotiation.category}</h2>
              <p className="text-xs text-[var(--muted-ink)]">
                You ({formatWallet(walletAddress)}) chatting with {counterpartyLabel}
              </p>
              <p className="text-xs text-[var(--muted-ink)]">{negotiation.deal_type} contract deal room</p>
            </div>
          </div>
          <StatusPill label={statusCopy.label} tone={statusCopy.tone} pulse={negotiation.status === 'active'} />
        </header>

        {negotiation.status === 'waiting' ? (
          <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-4 py-4 md:px-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Share Invite</h3>
            <p className="mt-1 text-sm text-[var(--ink)]">
              Send this private room invite by email or message. The link includes the room code.
            </p>

            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted-ink)]">Room Code</p>
                <code className="font-mono text-sm text-[var(--ink)]">{negotiationId}</code>
              </div>
              <label className="block text-[11px] uppercase tracking-wide text-[var(--muted-ink)]">
                Invite Link
                <input
                  readOnly
                  value={inviteLink}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={shareInvite} className="button-primary text-sm">
                Share Invite
              </button>
            </div>
            {shareFeedback ? <p className="mt-2 text-xs text-[var(--muted-ink)]">{shareFeedback}</p> : null}
          </div>
        ) : null}

        <div className="relative bg-[var(--surface-2)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'radial-gradient(circle at 16px 16px, color-mix(in srgb, var(--line), transparent 70%) 1.2px, transparent 0)',
              backgroundSize: '26px 26px',
            }}
          />

          <div className="relative max-h-[62vh] overflow-y-auto px-3 py-4 md:px-4 md:py-5">
            <div className="space-y-3">
              <div className="flex justify-center">
                <p className="rounded-full border border-[var(--line)] bg-[var(--surface-3)] px-3 py-1 text-[11px] text-[var(--muted-ink)]">
                  Private deal channel active
                </p>
              </div>

              {negotiation.rounds.length === 0 ? (
                <div className="flex justify-center">
                  <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface-3)] px-4 py-2 text-sm text-[var(--muted-ink)]">
                    {negotiation.status === 'waiting'
                      ? 'Waiting for the other party to join. Once they join, you can start chatting here.'
                      : 'No messages yet. Send the opening message.'}
                  </p>
                </div>
              ) : (
                negotiation.rounds.map((round) => {
                  const mine = round.party === role;
                  const bubbleMessage = roundToMessage(round);
                  return (
                    <div key={round.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[88%] md:max-w-[78%]">
                        <p className={`mb-1 text-[11px] ${mine ? 'text-right text-[var(--muted-ink)]' : 'text-[var(--muted-ink)]'}`}>
                          {mine ? 'You' : counterpartyLabel}
                        </p>
                        <div
                          className={`rounded-2xl border px-4 py-2 shadow-sm ${
                            mine
                              ? 'rounded-br-md border-[var(--ink)] bg-[var(--ink)] text-[var(--surface-1)]'
                              : 'rounded-bl-md border-[var(--line)] bg-[var(--surface-3)] text-[var(--ink)]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{bubbleMessage}</p>
                        </div>

                        <div className={`mt-1 flex items-center gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[10px] text-[var(--muted-ink)]">{formatTimestamp(round.created_at)}</span>
                          <details>
                            <summary className="cursor-pointer text-[10px] text-[var(--muted-ink)]">terms</summary>
                            <div className="mt-1">
                              <OfferTermsView
                                terms={round.offer_structured}
                                title={mine ? 'Your Structured Terms' : 'Counterparty Structured Terms'}
                                compact
                              />
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {negotiation.status === 'deal' ? (
                <div className="flex justify-center">
                  <p className="rounded-full border border-[color:color-mix(in_srgb,var(--success),#000000_40%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--success)_18%)] px-3 py-1 text-[11px] text-[var(--ink)]">
                    Deal agreed. Terms recorded.
                  </p>
                </div>
              ) : null}

              {negotiation.status === 'impasse' || negotiation.status === 'no_deal' ? (
                <div className="flex justify-center">
                  <p className="rounded-full border border-[color:color-mix(in_srgb,var(--danger),#000000_42%)] bg-[color:color-mix(in_srgb,var(--surface-3),var(--danger)_16%)] px-3 py-1 text-[11px] text-[var(--ink)]">
                    Conversation closed.
                  </p>
                </div>
              ) : null}

              <div ref={chatBottomRef} />
            </div>
          </div>
        </div>

        {negotiation.status !== 'waiting' ? (
          <footer className="border-t border-[var(--line)] bg-[var(--surface-2)] p-3 md:p-4">
            {negotiation.status === 'active' ? (
              <div className="space-y-3">
              {termsDraft && termsHash ? (
                <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Draft agreement (shared)
                  </p>
                  <OfferTermsView terms={termsDraft} compact title="Draft agreement" />
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-[var(--ink)]">
                      {isSelfNegotiation ? 'You (side A):' : `${role === 'A' ? 'You' : 'Counterparty'} (side A):`}{' '}
                      <span className="font-semibold">{partyAConfirmed ? 'Confirmed' : 'Pending'}</span>
                    </p>
                    <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-[var(--ink)]">
                      {isSelfNegotiation ? 'You (side B):' : `${role === 'B' ? 'You' : 'Counterparty'} (side B):`}{' '}
                      <span className="font-semibold">{partyBConfirmed ? 'Confirmed' : 'Pending'}</span>
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <textarea
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  placeholder="Write your deal message..."
                  className="min-h-[84px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-3)] p-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent-gold)]"
                />
                <button
                  type="button"
                  onClick={handleSubmitOffer}
                  disabled={submitting || markingDone || !offer.trim() || !canSendMessage}
                  className="button-primary h-11 px-4"
                >
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openDoneModal}
                  disabled={
                    submitting ||
                    markingDone ||
                    !canSendMessage ||
                    (myConfirmed && !otherConfirmed)
                  }
                  className="button-secondary text-xs"
                >
                  {markingDone ? 'Confirming...' : doneButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={handleWalkAway}
                  disabled={submitting || markingDone || !canSendMessage}
                  className="button-ghost text-xs text-[var(--danger)] hover:border-[var(--danger)]"
                >
                  Walk away
                </button>
              </div>

              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              </div>
            ) : negotiation.status === 'deal' ? (
              <InfoCallout
                title="Deal reached"
                description="Agreement is confirmed. The contract view will update automatically."
                tone="success"
              />
            ) : (
              <InfoCallout title="Deal room closed" description="No more messages can be sent for this room." tone="danger" />
            )}
          </footer>
        ) : null}

        {doneOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-10">
            <div className="w-full max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--surface-1)] p-5 shadow-xl md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-3xl text-[var(--ink)]">Confirm Agreement</h3>
                  <p className="mt-1 text-sm text-[var(--muted-ink)]">
                    This draft will be shared with both parties and used to lock funds in escrow. Amount is required.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDoneOpen(false);
                    setDoneError('');
                  }}
                  className="button-ghost text-xs"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Amount (ETH) <span className="text-[var(--danger)]">*</span>
                  </span>
                  <input
                    value={doneAmountEth}
                    onChange={(event) => setDoneAmountEth(event.target.value)}
                    placeholder="0.01"
                    inputMode="decimal"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Timeline <span className="text-[var(--muted-ink)]">(optional)</span>
                  </span>
                  <input
                    value={doneTimeline}
                    onChange={(event) => setDoneTimeline(event.target.value)}
                    placeholder="e.g. 5 days, Feb 20 to Feb 23"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Deliverables <span className="text-[var(--muted-ink)]">(optional)</span>
                  </span>
                  <textarea
                    value={doneDeliverables}
                    onChange={(event) => setDoneDeliverables(event.target.value)}
                    rows={2}
                    placeholder="e.g. 3 recorded lessons, 10 labeled images"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">
                    Additional notes <span className="text-[var(--muted-ink)]">(optional)</span>
                  </span>
                  <textarea
                    value={doneNotes}
                    onChange={(event) => setDoneNotes(event.target.value)}
                    rows={2}
                    placeholder="Anything else you want recorded in the agreement."
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>
              </div>

              {doneError ? <p className="mt-3 text-sm text-[var(--danger)]">{doneError}</p> : null}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDoneOpen(false);
                    setDoneError('');
                  }}
                  className="button-secondary text-sm"
                  disabled={markingDone}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDone}
                  className="button-primary text-sm"
                  disabled={markingDone}
                >
                  {markingDone ? 'Confirming...' : 'Confirm & Done'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </article>

      <aside className="space-y-4 lg:sticky lg:top-28 lg:h-fit">
        <InfoCallout title="Current State" description={statusCopy.description} tone={statusCopy.tone} />

        {suggestion?.suggestion ? (
          <InfoCallout title="AI Deal Hint (next move)" description={suggestion.suggestion} tone="info">
            <OfferTermsView terms={suggestion.suggested_terms} title="Suggested Terms" compact />
          </InfoCallout>
        ) : null}

        <InfoCallout
          title="Your Private Inputs"
          description="Visible only to your connected wallet in this room. These inputs are used for your side's strategy."
          tone="neutral"
        >
          {hasPrivateInputs ? (
            <OfferTermsView terms={myPrivateInputs} title="Private Inputs" compact />
          ) : (
            <p className="text-xs text-[var(--muted-ink)]">
              No private inputs were provided for this wallet.
            </p>
          )}
        </InfoCallout>

        {negotiation.status === 'deal' ? (
          <InfoCallout
            title="Deal captured"
            description="Final terms are now recorded. Continue to contracts to review the stored agreement and next settlement steps."
            tone="success"
          >
            <Link href="/contracts?from=deal" className="button-secondary text-xs">
              Open Contracts
            </Link>
          </InfoCallout>
        ) : null}
      </aside>
    </section>
  );
}
