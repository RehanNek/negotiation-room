import Link from 'next/link';

export default function HeroNarrative() {
  return (
    <section className="card page-reveal relative overflow-hidden p-8 md:p-14">
      <div className="pointer-events-none absolute inset-x-8 top-7 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-8 bottom-7 h-px bg-gradient-to-r from-transparent via-[var(--accent-gold)]/38 to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent-gold)]/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-12 h-80 w-80 rounded-full bg-[var(--accent-gold-strong)]/6 blur-3xl" />

      <div className="relative space-y-10">
        <div className="max-w-4xl space-y-5">
          <h1 className="font-display text-4xl leading-tight tracking-wide text-[var(--ink)] md:text-6xl">
            A private and verifiable negotiation room where parties reach agreement without a middleman.
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link href="/negotiate" className="button-primary">
            Start Negotiation
          </Link>
        </div>
      </div>
    </section>
  );
}
