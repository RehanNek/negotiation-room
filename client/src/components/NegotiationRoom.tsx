'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface NegotiationRoomProps {
  negotiationId: string;
  walletAddress: string;
  onComplete?: () => void;
}

export default function NegotiationRoom({ negotiationId, walletAddress, onComplete }: NegotiationRoomProps) {
  const [negotiation, setNegotiation] = useState<any>(null);
  const [offer, setOffer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastSuggestion, setLastSuggestion] = useState('');

  const poll = useCallback(async () => {
    try {
      const status = await api.getNegotiationStatus(negotiationId);
      setNegotiation(status);
      if (status.status === 'deal' || status.status === 'impasse' || status.status === 'no_deal') {
        onComplete?.();
      }
    } catch (err: any) {
      console.error('Poll error:', err);
    }
  }, [negotiationId, onComplete]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  async function handleSubmitOffer() {
    if (!offer.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.submitOffer({
        negotiation_id: negotiationId,
        wallet_address: walletAddress,
        offer: offer.trim(),
      });
      setLastSuggestion(result.suggestion?.suggestion || '');
      setOffer('');
      poll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWalkAway() {
    try {
      await api.walkAway({ negotiation_id: negotiationId, wallet_address: walletAddress });
      poll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!negotiation) {
    return <div className="text-gray-400 animate-pulse">Loading negotiation...</div>;
  }

  const isPartyA = walletAddress === negotiation.party_a_wallet;
  const myRole = isPartyA ? 'A' : 'B';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Room: {negotiation.category}</h2>
          <p className="text-sm text-gray-400">
            {negotiation.deal_type} deal — Round {negotiation.current_round}/{negotiation.max_rounds} — You are Party {myRole}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            negotiation.status === 'active' ? 'bg-green-900/30 text-green-400' :
            negotiation.status === 'deal' ? 'bg-blue-900/30 text-blue-400' :
            negotiation.status === 'waiting' ? 'bg-yellow-900/30 text-yellow-400' :
            'bg-red-900/30 text-red-400'
          }`}>
            {negotiation.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Waiting for second party */}
      {negotiation.status === 'waiting' && (
        <div className="p-6 border border-dashed border-yellow-700 rounded-xl bg-yellow-900/10 text-center">
          <p className="text-yellow-400 font-medium mb-2">Waiting for Party B to join</p>
          <p className="text-sm text-gray-400 mb-3">Share this Room ID:</p>
          <code className="px-4 py-2 bg-gray-800 rounded-lg text-sm font-mono text-white select-all">
            {negotiationId}
          </code>
        </div>
      )}

      {/* Rounds */}
      <div className="space-y-3">
        {negotiation.rounds.map((round: any, i: number) => (
          <div
            key={round.id || i}
            className={`p-4 rounded-xl border ${
              round.party === myRole
                ? 'border-blue-800 bg-blue-900/10 ml-8'
                : 'border-gray-700 bg-gray-900/50 mr-8'
            }`}
          >
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Party {round.party} — Round {round.round_number}</span>
              <span>{new Date(round.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="text-sm">
              {typeof round.offer_structured === 'object'
                ? JSON.stringify(round.offer_structured, null, 2)
                : round.offer_structured}
            </div>
          </div>
        ))}
      </div>

      {/* AI Suggestion */}
      {lastSuggestion && (
        <div className="p-4 border border-purple-800 bg-purple-900/10 rounded-xl">
          <p className="text-xs text-purple-400 mb-1">AI Suggestion</p>
          <p className="text-sm text-gray-300">{lastSuggestion}</p>
        </div>
      )}

      {/* Outcome */}
      {negotiation.status === 'deal' && (
        <div className="p-6 border border-green-700 bg-green-900/10 rounded-xl text-center">
          <p className="text-green-400 text-xl font-bold">DEAL REACHED</p>
          <p className="text-sm text-gray-400 mt-2">Contract has been created.</p>
        </div>
      )}
      {negotiation.status === 'impasse' && (
        <div className="p-6 border border-red-700 bg-red-900/10 rounded-xl text-center">
          <p className="text-red-400 text-xl font-bold">IMPASSE</p>
          <p className="text-sm text-gray-400 mt-2">Maximum rounds reached without agreement.</p>
        </div>
      )}
      {negotiation.status === 'no_deal' && (
        <div className="p-6 border border-red-700 bg-red-900/10 rounded-xl text-center">
          <p className="text-red-400 text-xl font-bold">NO DEAL</p>
          <p className="text-sm text-gray-400 mt-2">A party walked away from the negotiation.</p>
        </div>
      )}

      {/* Input */}
      {negotiation.status === 'active' && (
        <div className="space-y-3">
          <textarea
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Type your offer in plain English... (e.g., 'I can do the landing page for $300 with a 2-week timeline')"
            className="w-full p-4 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
            rows={3}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSubmitOffer}
              disabled={submitting || !offer.trim()}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition"
            >
              {submitting ? 'Submitting...' : 'Submit Offer'}
            </button>
            <button
              onClick={handleWalkAway}
              className="px-6 py-3 border border-red-700 text-red-400 hover:bg-red-900/20 rounded-xl font-medium transition"
            >
              Walk Away
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
