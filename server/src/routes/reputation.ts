import { Router, Request, Response } from 'express';
import { getReputation, getLeaderboard } from '../services/reputation';

const router = Router();

router.get('/leaderboard', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:wallet', (req: Request, res: Response) => {
  try {
    const reputation = getReputation(req.params.wallet as string);
    res.json(reputation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
