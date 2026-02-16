'use client';

import { useState, useCallback } from 'react';
import WalletConnect from '@/components/WalletConnect';
import NegotiationRoom from '@/components/NegotiationRoom';
import { api } from '@/lib/api';

type Step = 'connect' | 'choose' | 'create' | 'join' | 'negotiate';

export default function NegotiatePage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('connect');
  const [negotiationId, setNegotiationId] = useState('');
  const [error, setError] = useState('');

  // Create form state
  const [dealType, setDealType] = useState<'service' | 'conditional'>('service');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [dataSource, setDataSource] = useState('coingecko');
  const [resolutionDate, setResolutionDate] = useState('');
  const [constraints, setConstraints] = useState('');

  // Join form state
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinConstraints, setJoinConstraints] = useState('');

  const handleConnect = useCallback((addr: string) => {
    setWallet(addr || null);
    if (addr) setStep('choose');
    else setStep('connect');
  }, []);

  async function handleCreate() {
    setError('');
    if (!category.trim()) { setError('Category is required'); return; }

    try {
      const params: Record<string, any> = {};
      if (dealType === 'conditional') {
        params.condition = condition;
        params.data_source = dataSource;
        params.resolution_date = resolutionDate;
      }

      let parsedConstraints = {};
      if (constraints.trim()) {
        try { parsedConstraints = JSON.parse(constraints); }
        catch { parsedConstraints = { raw: constraints }; }
      }

      const result = await api.createNegotiation({
        deal_type: dealType,
        category: category.trim(),
        params,
        wallet_address: wallet!,
        constraints: parsedConstraints,
      });

      setNegotiationId(result.room_id);
      setStep('negotiate');
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleJoin() {
    setError('');
    if (!joinRoomId.trim()) { setError('Room ID is required'); return; }

    try {
      let parsedConstraints = {};
      if (joinConstraints.trim()) {
        try { parsedConstraints = JSON.parse(joinConstraints); }
        catch { parsedConstraints = { raw: joinConstraints }; }
      }

      await api.joinNegotiation({
        room_id: joinRoomId.trim(),
        wallet_address: wallet!,
        constraints: parsedConstraints,
      });

      setNegotiationId(joinRoomId.trim());
      setStep('negotiate');
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Negotiate</h1>

      {/* Step: Connect */}
      {step === 'connect' && (
        <div className="text-center py-12 space-y-4">
          <p className="text-gray-400">Connect your wallet to start negotiating.</p>
          <WalletConnect onConnect={handleConnect} address={wallet} />
        </div>
      )}

      {/* Step: Choose */}
      {step === 'choose' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <WalletConnect onConnect={handleConnect} address={wallet} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setStep('create')}
              className="p-8 border border-gray-700 hover:border-blue-600 rounded-xl text-center transition"
            >
              <div className="text-2xl mb-2">+</div>
              <div className="font-bold">Create Room</div>
              <div className="text-sm text-gray-400 mt-1">Start a new negotiation</div>
            </button>
            <button
              onClick={() => setStep('join')}
              className="p-8 border border-gray-700 hover:border-green-600 rounded-xl text-center transition"
            >
              <div className="text-2xl mb-2">&rarr;</div>
              <div className="font-bold">Join Room</div>
              <div className="text-sm text-gray-400 mt-1">Enter a room ID</div>
            </button>
          </div>
        </div>
      )}

      {/* Step: Create */}
      {step === 'create' && (
        <div className="space-y-4">
          <button onClick={() => setStep('choose')} className="text-sm text-gray-400 hover:text-white">&larr; Back</button>
          <h2 className="text-xl font-bold">Create Negotiation Room</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Deal Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => setDealType('service')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                  dealType === 'service' ? 'border-blue-600 bg-blue-900/20 text-blue-400' : 'border-gray-700 text-gray-400'
                }`}
              >
                Service Deal
              </button>
              <button
                onClick={() => setDealType('conditional')}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                  dealType === 'conditional' ? 'border-purple-600 bg-purple-900/20 text-purple-400' : 'border-gray-700 text-gray-400'
                }`}
              >
                Conditional Deal
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., web-development, consulting, crypto-bet"
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {dealType === 'conditional' && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Condition</label>
                <input
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  placeholder="e.g., Bitcoin price exceeds $100,000 by March 2026"
                  className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Data Source</label>
                  <select
                    value={dataSource}
                    onChange={(e) => setDataSource(e.target.value)}
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="coingecko">CoinGecko (Crypto)</option>
                    <option value="news">News API</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Resolution Date</label>
                  <input
                    type="date"
                    value={resolutionDate}
                    onChange={(e) => setResolutionDate(e.target.value)}
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Private Constraints (optional)</label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder='e.g., {"max_price": 500, "min_duration": "2 weeks"} or plain text'
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
              rows={2}
            />
            <p className="text-xs text-gray-600 mt-1">These are private and never shown to the other party.</p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleCreate}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition"
          >
            Create Room
          </button>
        </div>
      )}

      {/* Step: Join */}
      {step === 'join' && (
        <div className="space-y-4">
          <button onClick={() => setStep('choose')} className="text-sm text-gray-400 hover:text-white">&larr; Back</button>
          <h2 className="text-xl font-bold">Join Negotiation Room</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Room ID</label>
            <input
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="Paste the room ID here"
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Private Constraints (optional)</label>
            <textarea
              value={joinConstraints}
              onChange={(e) => setJoinConstraints(e.target.value)}
              placeholder='e.g., {"min_price": 200} or plain text'
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
              rows={2}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleJoin}
            className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-medium transition"
          >
            Join Room
          </button>
        </div>
      )}

      {/* Step: Negotiate */}
      {step === 'negotiate' && wallet && (
        <NegotiationRoom
          negotiationId={negotiationId}
          walletAddress={wallet}
          onComplete={() => {}}
        />
      )}
    </div>
  );
}
