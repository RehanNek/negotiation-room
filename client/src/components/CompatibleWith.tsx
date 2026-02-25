const BADGES = [
  { emoji: '🌸', label: 'Claude' },
  { emoji: '⚙️', label: 'Codex' },
  { emoji: '🦞', label: 'OpenClaw' },
];

export default function CompatibleWith() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-ink)]">
        Compatible With
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {BADGES.map(({ emoji, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--ink)]"
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </span>
        ))}
        <span className="text-sm text-[var(--muted-ink)]">+ more</span>
      </div>
    </div>
  );
}
