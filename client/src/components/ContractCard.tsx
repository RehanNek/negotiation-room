'use client';

interface ContractCardProps {
  contract: any;
  onResolve?: (id: string) => void;
}

export default function ContractCard({ contract, onResolve }: ContractCardProps) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-900/30 text-green-400 border-green-700',
    pending_resolution: 'bg-yellow-900/30 text-yellow-400 border-yellow-700',
    resolved: 'bg-blue-900/30 text-blue-400 border-blue-700',
  };

  const verdictColors: Record<string, string> = {
    TRUE: 'text-green-400',
    FALSE: 'text-red-400',
    PENDING: 'text-yellow-400',
  };

  return (
    <div className="border border-gray-700 rounded-xl p-5 bg-gray-900/50">
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className={`px-2 py-0.5 border rounded text-xs font-medium ${statusColors[contract.status] || ''}`}>
            {contract.status}
          </span>
          <span className="ml-2 px-2 py-0.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-400">
            {contract.deal_type}
          </span>
        </div>
        {contract.deal_type === 'conditional' && (
          <span className="text-[10px] px-2 py-0.5 bg-purple-900/30 border border-purple-700 rounded text-purple-400">
            Simulated Escrow
          </span>
        )}
      </div>

      <p className="text-sm text-gray-300 mb-3">{contract.summary}</p>

      <div className="text-xs text-gray-500 space-y-1">
        <div>Party A: <span className="text-gray-400 font-mono">{contract.party_a_wallet}</span></div>
        <div>Party B: <span className="text-gray-400 font-mono">{contract.party_b_wallet}</span></div>
        <div>Terms: <span className="text-gray-400">{JSON.stringify(contract.terms)}</span></div>
      </div>

      {contract.verdict && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <span className="text-xs text-gray-500">Verdict: </span>
          <span className={`text-sm font-bold ${verdictColors[contract.verdict] || ''}`}>{contract.verdict}</span>
          {contract.verdict_reasoning && (
            <p className="text-xs text-gray-400 mt-1">{contract.verdict_reasoning}</p>
          )}
        </div>
      )}

      {contract.status === 'pending_resolution' && onResolve && (
        <button
          onClick={() => onResolve(contract.id)}
          className="mt-3 w-full py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition"
        >
          Resolve Condition
        </button>
      )}

      {contract.attestation_id && (
        <div className="mt-2 text-xs text-gray-500">
          Attestation: <a href={`/verify?id=${contract.attestation_id}`} className="text-blue-400 hover:underline font-mono">
            {contract.attestation_id.slice(0, 8)}...
          </a>
        </div>
      )}
    </div>
  );
}
