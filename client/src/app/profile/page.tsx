'use client';

import { useState, useEffect, useCallback } from 'react';
import WalletConnect from '@/components/WalletConnect';
import ReputationBadge from '@/components/ReputationBadge';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);

  const handleConnect = useCallback((addr: string) => {
    setWallet(addr || null);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    api.getReputation(wallet).then(setReputation).catch(() => {});
    api.getContractsByWallet(wallet).then(setContracts).catch(() => {});
  }, [wallet]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Profile</h1>
        <WalletConnect onConnect={handleConnect} address={wallet} />
      </div>

      {!wallet && (
        <p className="text-gray-400 text-center py-12">Connect your wallet to see your profile.</p>
      )}

      {wallet && reputation && (
        <div className="grid md:grid-cols-2 gap-8">
          {/* Reputation */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Reputation</h2>
            <ReputationBadge
              score={reputation.total_reputation}
              goodFaith={reputation.good_faith_score}
              deals={reputation.deals_completed}
            />
            <div className="border border-gray-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Negotiations</span>
                <span>{reputation.total_negotiations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Deals Completed</span>
                <span>{reputation.deals_completed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Conditional Deals</span>
                <span>{reputation.conditional_deals}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Rounds</span>
                <span>{typeof reputation.avg_rounds === 'number' ? reputation.avg_rounds.toFixed(1) : '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Good Faith Score</span>
                <span>{reputation.good_faith_score}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Updated</span>
                <span className="text-xs">{reputation.last_updated}</span>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Contract History</h2>
            {contracts.length === 0 ? (
              <p className="text-gray-500">No contracts yet.</p>
            ) : (
              <div className="space-y-2">
                {contracts.map(c => (
                  <div key={c.id} className="p-3 border border-gray-800 rounded-lg text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">{c.deal_type}</span>
                      <span className={
                        c.status === 'active' ? 'text-green-400' :
                        c.status === 'pending_resolution' ? 'text-yellow-400' :
                        'text-blue-400'
                      }>{c.status}</span>
                    </div>
                    <p className="text-gray-300 mt-1 truncate">{c.summary}</p>
                    {c.attestation_id && (
                      <a href={`/verify?id=${c.attestation_id}`} className="text-xs text-blue-400 hover:underline">
                        View attestation
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
