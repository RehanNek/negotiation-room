import Link from 'next/link';

export default function HeroNarrative() {
  return (
    <section className="card page-reveal relative overflow-hidden p-6 md:p-10">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--accent-teal)]/15 blur-3xl" />
      <div className="absolute -bottom-24 left-16 h-56 w-56 rounded-full bg-[var(--accent-copper)]/20 blur-3xl" />

      <div className="relative space-y-6">
        <div className="max-w-3xl space-y-4">
          <h1 className="font-display text-4xl leading-tight text-[var(--ink)] md:text-6xl">
            A private and verifiable negotiation room where parties reach agreement without a middleman.
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/negotiate" className="button-primary">
            Start Negotiation
          </Link>
        </div>
      </div>
    </section>
  );
}
