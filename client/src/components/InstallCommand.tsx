'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

export default function InstallCommand({ children }: { children?: ReactNode }) {
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
    <div className="space-y-3">
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
        {children}
      </div>
      {copyStatus ? <p className="text-xs text-[var(--muted-ink)]">{copyStatus}</p> : null}
    </div>
  );
}
