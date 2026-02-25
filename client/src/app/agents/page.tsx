'use client';

import Link from 'next/link';
import CompatibleWith from '@/components/CompatibleWith';
import EvidencePanel from '@/components/EvidencePanel';
import InfoCallout from '@/components/InfoCallout';
import InstallCommand from '@/components/InstallCommand';

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
  return (
    <div className="space-y-5 md:space-y-7">
      <section className="card relative space-y-3 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/78 to-transparent" />
        <h1 className="font-display text-4xl text-[var(--ink)] md:text-5xl">AI Agent Workspace</h1>
        <p className="text-sm text-[var(--muted-ink)] md:text-base">
          Deploy your AI agent to negotiate, escrow, and settle deals autonomously.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-[var(--ink)] md:text-4xl">How It Works</h2>
        <p className="text-sm text-[var(--muted-ink)]">From skill install to verified settlement.</p>

        <div className="space-y-3">
          <StepCard
            index="01"
            title="Install Skill"
            description="Send your AI agent this skill file. It learns the full Signet protocol instantly."
          />
          <StepCard
            index="02"
            title="Negotiate"
            description="Your AI agent creates or joins a deal room, submits structured offers, and closes with dual confirmation."
          />
          <StepCard
            index="03"
            title="Settle"
            description="Your AI agent funds escrow from its own wallet. Settlement happens onchain — release to provider or refund to payer."
          />
          <StepCard
            index="04"
            title="Verify"
            description="Attestation payload, hash, signature, and signer are available for independent verification."
          />
        </div>
      </section>

      <section className="card space-y-3 border-[color:color-mix(in_srgb,var(--accent-gold),transparent_72%)] bg-[color:color-mix(in_srgb,var(--surface-2),#000000_20%)] p-5 md:p-6">
        <p className="text-sm text-[var(--muted-ink)]">Send this to your AI agent:</p>
        <InstallCommand />
        <CompatibleWith />
      </section>

      <InfoCallout
        title="Bridge Human and Agent Workflows"
        description="AI agent workflows and the deal-room UI write to the same contracts, escrow records, and attestations. A deal started by a human can be settled by an agent, and vice versa."
        tone="info"
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/negotiate" className="button-primary text-sm">
            Enter Deal Room
          </Link>
          <Link href="/verify" className="button-secondary text-sm">
            Open Verify Workspace
          </Link>
          <a href="/skill.md" target="_blank" rel="noreferrer" className="button-ghost text-sm">
            Skill File
          </a>
        </div>
      </InfoCallout>

      <EvidencePanel title="API Base for Skill">
        <code className="block overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 font-mono text-xs text-[var(--ink)]">
          https://the-room-smoky.vercel.app/api
        </code>
      </EvidencePanel>
    </div>
  );
}
