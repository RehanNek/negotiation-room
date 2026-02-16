'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import WalletConnect from '@/components/WalletConnect';
import ReputationBadge from '@/components/ReputationBadge';
import { api } from '@/lib/api';

export default function Home() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const handleConnect = useCallback((addr: string) => {
    setWallet(addr || null);
  }, []);

  useEffect(() => {
    api.health()
      .then(() => setServerStatus('online'))
      .catch(() => setServerStatus('offline'));
    api.getLeaderboard(5).then(setLeaderboard).catch(() => {});
  }, []);

  useEffect(() => {
    if (wallet) {
      api.getReputation(wallet).then(setReputation).catch(() => {});
    }
  }, [wallet]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold tracking-tight mb-4">THE ROOM</h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Verifiable negotiation infrastructure. Private deals, conditional contracts, provable fairness.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/negotiate"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition"
          >
            Start Negotiating
          </Link>
          <Link
            href="/verify"
            className="px-6 py-3 border border-gray-600 hover:border-gray-400 rounded-xl font-medium transition"
          >
            Verify Attestation
          </Link>
        </div>
        <div className="mt-4 flex justify-center items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${
            serverStatus === 'online' ? 'bg-green-400' : serverStatus === 'offline' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'
          }`} />
          <span className="text-gray-500">
            Server: {serverStatus}
          </span>
        </div>
      </div>

      {/* Wallet + Rep */}
      <div className="flex justify-center">
        <WalletConnect onConnect={handleConnect} address={wallet} />
      </div>

      {wallet && reputation && (
        <div className="max-w-xs mx-auto">
          <ReputationBadge
            score={reputation.total_reputation}
            goodFaith={reputation.good_faith_score}
            deals={reputation.deals_completed}
          />
        </div>
      )}

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            title: 'Private Negotiation',
            desc: 'Your constraints stay secret. Only offers are visible. All logic runs inside a TEE.',
          },
          {
            title: 'Conditional Contracts',
            desc: 'Create deals that auto-resolve based on real-world data — crypto prices, events, and more.',
          },
          {
            title: 'Reputation System',
            desc: 'Build trust through fair dealing. Your reputation follows your wallet across negotiations.',
          },
        ].map((f) => (
          <div key={f.title} className="p-6 border border-gray-800 rounded-xl bg-gray-900/30">
            <h3 className="font-bold mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">Top Negotiators</h2>
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            {leaderboard.map((entry, i) => (
              <div key={entry.wallet_address} className="flex justify-between items-center px-5 py-3 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm w-6">{i + 1}.</span>
                  <span className="font-mono text-sm">{entry.wallet_address}</span>
                </div>
                <span className="text-blue-400 font-bold">{entry.total_reputation} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Powered By */}
      <div className="text-center text-xs text-gray-600 py-4">
        Powered by EigenCloud TEE — Built for the EigenCloud Open Innovation Challenge
      </div>
    </div>
  );
}
