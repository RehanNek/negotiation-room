'use client';

interface ReputationBadgeProps {
  score: number;
  goodFaith: number;
  deals: number;
  compact?: boolean;
}

export default function ReputationBadge({ score, goodFaith, deals, compact }: ReputationBadgeProps) {
  const tier =
    score >= 50 ? { label: 'Diamond', color: 'text-cyan-400 border-cyan-600' } :
    score >= 30 ? { label: 'Gold', color: 'text-yellow-400 border-yellow-600' } :
    score >= 10 ? { label: 'Silver', color: 'text-gray-300 border-gray-500' } :
    { label: 'Bronze', color: 'text-orange-400 border-orange-600' };

  if (compact) {
    return (
      <span className={`px-2 py-0.5 border rounded text-xs font-medium ${tier.color}`}>
        {tier.label} ({score})
      </span>
    );
  }

  return (
    <div className={`p-4 border rounded-xl ${tier.color} bg-gray-900/50`}>
      <div className="text-2xl font-bold">{score}</div>
      <div className="text-sm opacity-80">{tier.label} Tier</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="opacity-60">Good Faith</span>
          <div className="font-medium">{goodFaith}%</div>
        </div>
        <div>
          <span className="opacity-60">Deals</span>
          <div className="font-medium">{deals}</div>
        </div>
      </div>
    </div>
  );
}
