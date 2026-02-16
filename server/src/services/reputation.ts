import { run, get, all } from '../db';

type EventType = 'deal' | 'impasse' | 'walkaway' | 'good_faith' | 'lowball' | 'clean_resolution' | 'disputed';

const POINTS: Record<EventType, number> = {
  deal: 10,
  good_faith: 5,
  impasse: 0,
  walkaway: -2,
  lowball: -5,
  clean_resolution: 3,
  disputed: -3,
};

function ensureReputation(wallet: string): void {
  const exists = get('SELECT 1 FROM reputation WHERE wallet_address = ?', [wallet]);
  if (!exists) {
    run(
      `INSERT INTO reputation (wallet_address, total_negotiations, deals_completed, conditional_deals, avg_rounds, good_faith_score, total_reputation) VALUES (?, 0, 0, 0, 0, 50, 0)`,
      [wallet]
    );
  }
}

export function updateReputation(wallet: string, event: EventType, rounds?: number): void {
  ensureReputation(wallet);

  const rep = get('SELECT * FROM reputation WHERE wallet_address = ?', [wallet]);

  let newTotal = (rep.total_reputation as number) + (POINTS[event] || 0);
  let newNegotiations = (rep.total_negotiations as number) + 1;
  let newDeals = rep.deals_completed as number;
  let newGoodFaith = rep.good_faith_score as number;
  let newAvgRounds = rep.avg_rounds as number;

  if (event === 'deal') {
    newDeals += 1;
    newGoodFaith = Math.min(100, newGoodFaith + 5);
    if (rounds && rounds <= 3) newTotal += 3;
  } else if (event === 'walkaway') {
    newGoodFaith = Math.max(0, newGoodFaith - 5);
  } else if (event === 'impasse') {
    newGoodFaith = Math.max(0, newGoodFaith - 2);
  }

  if (rounds) {
    newAvgRounds = ((rep.avg_rounds as number) * (rep.total_negotiations as number) + rounds) / newNegotiations;
  }

  run(
    `UPDATE reputation SET total_negotiations = ?, deals_completed = ?, avg_rounds = ?, good_faith_score = ?, total_reputation = ?, last_updated = datetime('now') WHERE wallet_address = ?`,
    [newNegotiations, newDeals, newAvgRounds, newGoodFaith, newTotal, wallet]
  );
}

export function getReputation(wallet: string): any {
  ensureReputation(wallet);
  return get('SELECT * FROM reputation WHERE wallet_address = ?', [wallet]);
}

export function getLeaderboard(limit: number = 10): any[] {
  return all('SELECT * FROM reputation ORDER BY total_reputation DESC LIMIT ?', [limit]);
}
