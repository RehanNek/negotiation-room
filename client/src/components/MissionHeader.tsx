'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatWallet } from '@/lib/formatters';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/negotiate', label: 'Negotiate' },
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
    const saved = localStorage.getItem('wallet_address');
    const token = localStorage.getItem('auth_token');

    if (saved && !token) {
      void Promise.resolve().then(() => {
        if (!mounted) return;
        setWallet(saved);
        setMode(null);
      });
      return () => {
        mounted = false;
      };
    }
    if (!saved || !token) {
      void Promise.resolve().then(() => {
        if (!mounted) return;
        setWallet(null);
        setMode(null);
      });
      return () => {
        mounted = false;
      };
    }

    api.me()
      .then((session) => {
        if (!mounted) return;
        setWallet(session.wallet_address || saved);
        setMode(session.mode);
      })
      .catch(() => {
        if (!mounted) return;
        localStorage.removeItem('auth_token');
        setWallet(saved || null);
        setMode(null);
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  return (
    <header className="mission-header sticky top-0 z-40 border-b border-[var(--line)] bg-[color:var(--surface-1)]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 md:px-8 md:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <Link href="/" className="font-display text-3xl leading-none tracking-tight text-[var(--ink)] md:text-4xl lg:text-5xl">
              Negotiation Room
            </Link>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              Private. Verifiable. No middleman.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {wallet ? (
              <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs md:flex">
                <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="font-mono text-[var(--ink)]">{formatWallet(wallet)}</span>
                <span className="rounded-full border border-[var(--line)] bg-white/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-ink)]">
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

        <nav className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition md:text-sm ${
                  active
                    ? 'bg-[var(--ink)] text-[var(--surface-1)]'
                    : 'text-[var(--muted-ink)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
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
