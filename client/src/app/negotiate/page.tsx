'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FlowStepper from '@/components/FlowStepper';
import InfoCallout from '@/components/InfoCallout';
import NegotiationRoom, { type NegotiationCompletion } from '@/components/NegotiationRoom';
import WalletConnect from '@/components/WalletConnect';
import { api } from '@/lib/api';
import { canAdvanceFromSetup, resolveInitialStep, resolveStepAfterPath } from '@/lib/flow';
import type { DealType } from '@/lib/types';

const FLOW_STEPS = [
  { id: 'identity', label: 'Identity', description: 'Connect a wallet and start a session.' },
  { id: 'path', label: 'Room', description: 'Create a new room or join an invite.' },
  { id: 'setup', label: 'Private Notes', description: 'Add private notes for strategy (optional).' },
  { id: 'live', label: 'Deal Chat', description: 'Work through terms privately and confirm the deal.' },
] as const;

type WizardStep = (typeof FLOW_STEPS)[number]['id'];
type NegotiationPath = 'create_custom' | 'join_existing';

function parsePrivateNotes(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { note: trimmed };
  }
}

function persistPrivateInputs(roomId: string, wallet: string, inputs: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const walletKey = wallet.trim().toLowerCase();
  if (!walletKey) return;
  localStorage.setItem(`private_inputs:${roomId}:${walletKey}`, JSON.stringify(inputs));
}

function NegotiateWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomFromQuery = useMemo(() => (searchParams.get('room') || '').trim(), [searchParams]);

  const [wallet, setWallet] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>('identity');
  const [path, setPath] = useState<NegotiationPath | null>(null);
  const [negotiationId, setNegotiationId] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [finalNote, setFinalNote] = useState('');

  const [dealType, setDealType] = useState<DealType>('service');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [dataSource, setDataSource] = useState('coingecko');
  const [resolutionDate, setResolutionDate] = useState('');
  const [constraints, setConstraints] = useState('');

  const [joinRoomId, setJoinRoomId] = useState(roomFromQuery);
  const [joinConstraints, setJoinConstraints] = useState('');

  const hasSetupInputs = useMemo(() => {
    if (!path) return false;
    if (path === 'create_custom') return category.trim().length > 0;
    if (path === 'join_existing') return joinRoomId.trim().length > 0;
    return true;
  }, [category, constraints, joinConstraints, joinRoomId, path]);

  const handleConnect = useCallback((address: string) => {
    const normalized = address || null;
    setWallet(normalized);
    setFinalNote('');
    setError('');

    if (normalized) {
      if (roomFromQuery) {
        setJoinRoomId((prev) => prev || roomFromQuery);
        setPath('join_existing');
        setStep('setup');
      } else {
        setStep(resolveInitialStep(true));
      }
    } else {
      setStep('identity');
      setPath(null);
      setNegotiationId('');
    }
  }, [roomFromQuery]);

  async function handleCreateCustom() {
    if (!wallet) {
      setError('Connect a wallet first.');
      setStep('identity');
      return;
    }

    if (!canAdvanceFromSetup(path || 'create_custom', hasSetupInputs)) {
      setError('Category is required for new room creation.');
      return;
    }

    setWorking(true);
    setError('');
    setFinalNote('');

    try {
      const params: Record<string, unknown> = {};
      const privateInputs = parsePrivateNotes(constraints);
      if (dealType === 'conditional') {
        params.condition = condition || 'Bitcoin closes above 100000 USD by the resolution date.';
        params.data_source = dataSource;
        params.resolution_date = resolutionDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      }

      const result = await api.createNegotiation({
        deal_type: dealType,
        category: category.trim(),
        params,
        constraints: privateInputs,
      });

      persistPrivateInputs(result.room_id, wallet, privateInputs);
      setNegotiationId(result.room_id);
      setStep('live');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setWorking(false);
    }
  }

  async function handleJoinExisting() {
    if (!wallet) {
      setError('Connect a wallet first.');
      setStep('identity');
      return;
    }

    if (!canAdvanceFromSetup(path || 'join_existing', hasSetupInputs)) {
      setError('Room ID is required.');
      return;
    }

    setWorking(true);
    setError('');
    setFinalNote('');

    try {
      const roomId = joinRoomId.trim();
      const privateInputs = parsePrivateNotes(joinConstraints);
      await api.joinNegotiation({
        room_id: roomId,
        constraints: privateInputs,
      });

      persistPrivateInputs(roomId, wallet, privateInputs);
      setNegotiationId(roomId);
      setStep('live');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setWorking(false);
    }
  }

  async function handleCompletion(completion: NegotiationCompletion) {
    if (!wallet) return;

    if (completion.status === 'deal') {
      let contractId = completion.contractId;

      if (!contractId) {
        try {
          const contracts = await api.getContractsByWallet(wallet);
          const match = contracts
            .filter((contract) => contract.negotiation_id === completion.negotiationId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          contractId = match?.id;
        } catch {
          contractId = undefined;
        }
      }

      const target = contractId
        ? `/contracts?from=deal&focus=${encodeURIComponent(contractId)}`
        : '/contracts?from=deal';
      router.push(target);
      return;
    }

    if (completion.status === 'impasse') {
      setFinalNote('Deal room reached an impasse. You can start a new room or revise strategy and retry.');
    }
    if (completion.status === 'no_deal') {
      setFinalNote('Deal room closed without agreement. Start a new room when ready.');
    }
  }

  function selectPath(nextPath: NegotiationPath) {
    setPath(nextPath);
    setError('');
    setFinalNote('');
    if (nextPath === 'join_existing' && roomFromQuery && !joinRoomId) {
      setJoinRoomId(roomFromQuery);
    }
    setStep(resolveStepAfterPath(nextPath));
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="card space-y-4 p-5 md:p-6">
        <div>
          <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Deal Room Workspace</h1>
          <p className="mt-1 text-sm text-[var(--muted-ink)] md:text-base">
            Create a private room, work directly with the counterparty, and record verifiable deal proof.
          </p>
        </div>

        <FlowStepper steps={FLOW_STEPS.map((item) => ({ ...item }))} activeStepId={step} />

        {error ? <InfoCallout title="Action needed" description={error} tone="danger" /> : null}
        {finalNote ? <InfoCallout title="Outcome" description={finalNote} tone="warning" /> : null}
        <InfoCallout
          title="AI agents supported"
          description="AI agents can also create and join rooms via the API."
          tone="info"
        >
          <a href="/agents" className="button-ghost text-xs">Learn more →</a>
        </InfoCallout>
      </section>

      {step === 'identity' ? (
        <section className="card p-5 md:p-6">
          <h2 className="font-display text-3xl text-[var(--ink)]">Step 1: Establish Identity</h2>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            Use MetaMask for signature-backed identity before entering the private deal room.
          </p>
          <div className="mt-4">
            <WalletConnect onConnect={handleConnect} address={wallet} />
          </div>
        </section>
      ) : null}

      {step === 'path' ? (
        <div className="space-y-3">
          {roomFromQuery ? (
            <InfoCallout
              title="Invitation detected"
              description={`A room code was detected: ${roomFromQuery}. Choose "Join Existing Room" to enter.`}
              tone="info"
            />
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <article className="card space-y-4 p-5 md:p-6">
              <h3 className="font-display text-2xl text-[var(--ink)]">Create New Room</h3>
              <p className="text-sm text-[var(--muted-ink)]">
                Start a private room and share the invite with someone you want to make a deal with.
              </p>
              <button className="button-secondary w-full justify-center" type="button" onClick={() => selectPath('create_custom')}>
                Create New Room
              </button>
            </article>

            <article className="card space-y-4 p-5 md:p-6">
              <h3 className="font-display text-2xl text-[var(--ink)]">Join Existing Room</h3>
              <p className="text-sm text-[var(--muted-ink)]">
                Enter a room code from an invite and start negotiating.
              </p>
              <button className="button-secondary w-full justify-center" type="button" onClick={() => selectPath('join_existing')}>
                Enter Room Code
              </button>
            </article>
          </section>
        </div>
      ) : null}

      {step === 'setup' && path === 'create_custom' ? (
        <section className="card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl text-[var(--ink)]">Step 3: Configure New Room</h2>
            <button className="button-ghost text-sm" type="button" onClick={() => setStep('path')}>
              Back to room choice
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Deal Type</span>
              <select value={dealType} onChange={(event) => setDealType(event.target.value as DealType)} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]">
                <option value="service">Service Contract</option>
                <option value="conditional">Conditional Contract</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Category</span>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="e.g. ai-consulting, data-labeling, btc-bet"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
              />
            </label>

            {dealType === 'conditional' ? (
              <>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Condition</span>
                  <input
                    value={condition}
                    onChange={(event) => setCondition(event.target.value)}
                    placeholder="Bitcoin closes above 100000 USD by date"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Data Source</span>
                  <select value={dataSource} onChange={(event) => setDataSource(event.target.value)} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]">
                    <option value="coingecko">CoinGecko</option>
                    <option value="news">News Feed</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Resolution Date</span>
                  <input
                    type="date"
                    value={resolutionDate}
                    onChange={(event) => setResolutionDate(event.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                  />
                </label>
              </>
            ) : null}

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Private Notes (optional)</span>
              <textarea
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
                placeholder='This is meant to help you strategise. Only you can see this. Example: {"max_price_usd": 500, "deadline": "2026-03-01"}'
              />
              <p className="text-xs text-[var(--muted-ink)]">This is meant to help you strategise. Only you can see this.</p>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-primary" onClick={handleCreateCustom} disabled={working || !hasSetupInputs}>
              {working ? 'Creating room...' : 'Create and enter room'}
            </button>
            <button type="button" className="button-secondary" onClick={() => setStep('path')}>
              Change room choice
            </button>
          </div>
        </section>
      ) : null}

      {step === 'setup' && path === 'join_existing' ? (
        <section className="card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl text-[var(--ink)]">Step 3: Join Room</h2>
            <button className="button-ghost text-sm" type="button" onClick={() => setStep('path')}>
              Back to room choice
            </button>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Room ID</span>
            <input
              value={joinRoomId}
              onChange={(event) => setJoinRoomId(event.target.value)}
              placeholder="Paste room id"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 font-mono text-sm text-[var(--ink)]"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">Private Notes (optional)</span>
            <textarea
              value={joinConstraints}
              onChange={(event) => setJoinConstraints(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--ink)]"
              placeholder='This is meant to help you strategise. Only you can see this. Example: {"target_price_usd": 250}'
            />
            <p className="text-xs text-[var(--muted-ink)]">This is meant to help you strategise. Only you can see this.</p>
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-primary" onClick={handleJoinExisting} disabled={working || !hasSetupInputs}>
              {working ? 'Joining...' : 'Join and enter room'}
            </button>
            <button type="button" className="button-secondary" onClick={() => setStep('path')}>
              Change room choice
            </button>
          </div>
        </section>
      ) : null}

      {step === 'live' && wallet ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-3xl text-[var(--ink)]">Step 4: Live Deal Room</h2>
            <button
              type="button"
              onClick={() => {
                setStep('path');
                setPath(null);
                setNegotiationId('');
                setFinalNote('');
                setError('');
              }}
              className="button-ghost text-sm"
            >
              Start new deal room
            </button>
          </div>

          <NegotiationRoom negotiationId={negotiationId} walletAddress={wallet} onComplete={handleCompletion} />
        </section>
      ) : null}
    </div>
  );
}

export default function NegotiatePage() {
  return (
    <Suspense fallback={<section className="card p-6 text-sm text-[var(--muted-ink)]">Loading deal room workspace...</section>}>
      <NegotiateWorkspace />
    </Suspense>
  );
}
