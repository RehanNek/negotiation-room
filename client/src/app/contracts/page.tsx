'use client';

import { useState, useEffect, useCallback } from 'react';
import WalletConnect from '@/components/WalletConnect';
import ContractCard from '@/components/ContractCard';
import { api } from '@/lib/api';

export default function ContractsPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleConnect = useCallback((addr: string) => {
    setWallet(addr || null);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    api.getContractsByWallet(wallet)
      .then(setContracts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  async function handleResolve(contractId: string) {
    try {
      await api.resolveCondition(contractId);
      // Refresh
      if (wallet) {
        const updated = await api.getContractsByWallet(wallet);
        setContracts(updated);
      }
    } catch (err: any) {
      alert(err.message);
    }
  }

  const active = contracts.filter(c => c.status === 'active');
  const pending = contracts.filter(c => c.status === 'pending_resolution');
  const resolved = contracts.filter(c => c.status === 'resolved');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Contracts</h1>
        <WalletConnect onConnect={handleConnect} address={wallet} />
      </div>

      {!wallet && (
        <p className="text-gray-400 text-center py-12">Connect your wallet to see your contracts.</p>
      )}

      {wallet && loading && (
        <p className="text-gray-400 animate-pulse">Loading contracts...</p>
      )}

      {wallet && !loading && contracts.length === 0 && (
        <p className="text-gray-500 text-center py-12">No contracts yet. Complete a negotiation to create one.</p>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-yellow-400 mb-3">Pending Resolution ({pending.length})</h2>
          <div className="grid gap-4">
            {pending.map(c => <ContractCard key={c.id} contract={c} onResolve={handleResolve} />)}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-green-400 mb-3">Active ({active.length})</h2>
          <div className="grid gap-4">
            {active.map(c => <ContractCard key={c.id} contract={c} />)}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-blue-400 mb-3">Resolved ({resolved.length})</h2>
          <div className="grid gap-4">
            {resolved.map(c => <ContractCard key={c.id} contract={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}
