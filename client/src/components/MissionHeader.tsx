'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AUTH_CHANGED_EVENT } from '@/lib/events';
import { formatWallet } from '@/lib/formatters';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/negotiate', label: 'Deal Room' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/profile', label: 'Profile' },
  { href: '/verify', label: 'Verify' },
];

export default function MissionHeader() {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string | null>(null);
  const [mode, setMode] = useState<'signature' | 'demo' | null>(null);

  useEffect(() => {
    let mounted = true;

    async function refreshSession() {
      const saved = localStorage.getItem('wallet_address');
      const token = localStorage.getItem('auth_token');

      if (!saved || !token) {
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('auth_token');
        if (!mounted) return;
        setWallet(null);
        setMode(null);
        return;
      }

      try {
        const session = await api.me();
        if (!mounted) return;
        localStorage.setItem('wallet_address', session.wallet_address);
        setWallet(session.wallet_address || saved);
        setMode(session.mode);
      } catch {
        if (!mounted) return;
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('auth_token');
        setWallet(null);
        setMode(null);
      }
    }

    function handleAuthChanged() {
      void refreshSession();
    }

    void refreshSession();
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);

    return () => {
      mounted = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    };
  }, [pathname]);

  return (
    <header className="mission-header sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--surface-1)]/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:px-8 md:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <Link
              href="/"
              className="font-display text-3xl leading-none tracking-[0.09em] text-[var(--ink)] md:text-4xl lg:text-5xl"
            >
              Signet
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {wallet ? (
              <div className="hidden items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs md:flex">
                <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="font-mono text-[var(--ink)]">{formatWallet(wallet)}</span>
                <span className="rounded-full border border-[var(--line)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-ink)]">
                  {mode || 'session'}
                </span>
              </div>
            ) : (
              <span className="hidden rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--muted-ink)] md:inline-block">
                No active session
              </span>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium tracking-[0.06em] transition md:text-sm ${
                  active
                    ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] shadow-[inset_0_-1px_0_0_var(--accent-gold)]'
                    : 'border-transparent text-[var(--muted-ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
