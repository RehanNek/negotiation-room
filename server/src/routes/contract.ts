import { Router, Request, Response } from 'express';
import { getContract, getContractsByWallet, resolveCondition } from '../services/contract';

const router = Router();

router.get('/wallet/:wallet', (req: Request, res: Response) => {
  try {
    const contracts = getContractsByWallet(req.params.wallet as string);
    res.json(contracts);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const contract = getContract(req.params.id as string);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    res.json(contract);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const result = await resolveCondition(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
