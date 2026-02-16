import { Router } from 'express';
import { getReputation, getLeaderboard } from '../services/reputation';
import { route } from './utils';

const router = Router();

router.get('/leaderboard', route((req, res) => {
  const limit = parseInt(req.query.limit as string, 10) || 10;
  const leaderboard = getLeaderboard(limit);
  res.json(leaderboard);
}));

router.get('/:wallet', route((req, res) => {
  const reputation = getReputation(req.params.wallet as string);
  res.json(reputation);
}));

export default router;
