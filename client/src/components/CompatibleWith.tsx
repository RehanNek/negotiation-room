function ClaudeLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="9" cy="9" r="9" fill="#CC785C" />
      <g stroke="white" strokeWidth="1.25" strokeLinecap="round">
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line key={deg} x1="9" y1="2.5" x2="9" y2="5.5" transform={`rotate(${deg} 9 9)`} />
        ))}
      </g>
    </svg>
  );
}

function CodexLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="18" height="18" rx="3.5" fill="#7B2DA0" />
      <g stroke="white" strokeWidth="1.5" strokeLinecap="round">
        <line x1="9" y1="2.5" x2="9" y2="15.5" />
        <line x1="9" y1="2.5" x2="9" y2="15.5" transform="rotate(60 9 9)" />
        <line x1="9" y1="2.5" x2="9" y2="15.5" transform="rotate(120 9 9)" />
      </g>
    </svg>
  );
}

const BADGES = [
  { icon: <ClaudeLogo />, label: 'Claude' },
  { icon: <CodexLogo />, label: 'Codex' },
  { icon: '🦞', label: 'OpenClaw' },
];

export default function CompatibleWith() {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-ink)]">
        Compatible With
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {BADGES.map(({ icon, label }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--ink)]"
          >
            <span className="flex items-center">{icon}</span>
            <span>{label}</span>
          </span>
        ))}
        <span className="text-sm text-[var(--muted-ink)]">+ more</span>
      </div>
    </div>
  );
}
