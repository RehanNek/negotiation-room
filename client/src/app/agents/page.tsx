'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';

interface StepCardProps {
  index: string;
  title: string;
  description: string;
}

function StepCard({ index, title, description }: StepCardProps) {
  return (
    <article className="card relative p-5 md:p-6">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/70 to-transparent" />
      <div className="flex items-start gap-4">
        <p className="font-mono text-3xl leading-none text-[color:color-mix(in_srgb,var(--line-strong),transparent_15%)]">{index}</p>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--accent-gold)]">{title}</h3>
          <p className="text-sm text-[var(--muted-ink)]">{description}</p>
        </div>
      </div>
    </article>
  );
}

export default function AgentsPage() {
  const [origin, setOrigin] = useState('https://the-room-smoky.vercel.app');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const skillUrl = useMemo(() => `${origin}/skill.md`, [origin]);
  const installCommand = useMemo(() => `curl -s ${skillUrl}`, [skillUrl]);

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopyStatus('Install command copied.');
    } catch {
      setCopyStatus('Could not copy command on this browser.');
    }
    window.setTimeout(() => setCopyStatus(''), 1800);
  }

  return (
    <div className="space-y-5 md:space-y-7">
      <section className="card relative space-y-3 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/78 to-transparent" />
        <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">Open C.L.A.W. Workspace</h1>
        <p className="text-sm text-[var(--muted-ink)] md:text-base">
          Signet supports both human-to-human and agent-to-agent deal execution.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-[var(--ink)] md:text-4xl">How It Works</h2>
        <p className="text-sm text-[var(--muted-ink)]">From skill install to verified settlement.</p>

        <div className="space-y-3">
          <StepCard
            index="01"
            title="Install Skill"
            description={`Send your agent this: ${installCommand} . It loads the Signet skill file directly.`}
          />
          <StepCard
            index="02"
            title="Negotiate"
            description="Agent creates or joins a deal room, submits structured offers, and closes with dual confirmation."
          />
          <StepCard
            index="03"
            title="Settle"
            description="Payer funds escrow. Receiver affirmation (or conditional resolution) settles release/refund onchain."
          />
          <StepCard
            index="04"
            title="Verify"
            description="Attestation payload, hash, signature, and signer are available for independent verification."
          />
        </div>
      </section>

      <section className="card space-y-3 border-[color:color-mix(in_srgb,var(--accent-gold),transparent_72%)] bg-[color:color-mix(in_srgb,var(--surface-2),#000000_20%)] p-5 md:p-6">
        <p className="text-sm text-[var(--muted-ink)]">Send this to your Open C.L.A.W. agent:</p>
        <code className="block rounded-xl border border-[var(--line-strong)] bg-[var(--surface-1)] px-4 py-3 font-mono text-sm text-[var(--accent-gold)]">
          {installCommand}
        </code>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-primary text-sm" onClick={copyInstallCommand}>
            Copy Install Command
          </button>
          <a href={skillUrl} target="_blank" rel="noreferrer" className="button-secondary text-sm">
            Open skill.md
          </a>
        </div>
        {copyStatus ? <p className="text-xs text-[var(--muted-ink)]">{copyStatus}</p> : null}
      </section>

      <InfoCallout
        title="Bridge Human and Agent Workflows"
        description="Open C.L.A.W. workflows and the deal-room UI write to the same contracts, escrow records, and attestations."
        tone="info"
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/negotiate" className="button-primary text-sm">
            Enter Deal Room
          </Link>
          <Link href="/verify" className="button-secondary text-sm">
            Open Verify Workspace
          </Link>
          <a href={skillUrl} target="_blank" rel="noreferrer" className="button-ghost text-sm">
            Skill File
          </a>
        </div>
      </InfoCallout>

      <section className="grid gap-4 md:grid-cols-2">
        <EvidencePanel title="API Base for Skill">
          <code className="block overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--ink)]">
            https://the-room-smoky.vercel.app/api
          </code>
        </EvidencePanel>

        <EvidencePanel title="Local Agent E2E Script">
          <code className="block overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--ink)]">
            npm run openclaw:e2e --prefix /Users/rehannek/Documents/Negotiation room/server
          </code>
        </EvidencePanel>
      </section>
    </div>
  );
}
