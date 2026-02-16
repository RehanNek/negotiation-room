import { Router, Request, Response } from 'express';
import { createNegotiation, joinNegotiation, submitOffer, walkAway, getNegotiationStatus } from '../services/negotiation';

const router = Router();

router.post('/create', (req: Request, res: Response) => {
  try {
    const { deal_type, category, params, wallet_address, constraints } = req.body;
    if (!deal_type || !category || !wallet_address) {
      res.status(400).json({ error: 'Missing required fields: deal_type, category, wallet_address' });
      return;
    }
    const result = createNegotiation({
      deal_type,
      category,
      params: params || {},
      wallet_address,
      constraints: constraints || {},
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/join', (req: Request, res: Response) => {
  try {
    const { room_id, wallet_address, constraints } = req.body;
    if (!room_id || !wallet_address) {
      res.status(400).json({ error: 'Missing required fields: room_id, wallet_address' });
      return;
    }
    const result = joinNegotiation({ room_id, wallet_address, constraints: constraints || {} });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/offer', async (req: Request, res: Response) => {
  try {
    const { negotiation_id, wallet_address, offer, structured } = req.body;
    if (!negotiation_id || !wallet_address || !offer) {
      res.status(400).json({ error: 'Missing required fields: negotiation_id, wallet_address, offer' });
      return;
    }
    const result = await submitOffer({ negotiation_id, wallet_address, offer, structured });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/walkaway', (req: Request, res: Response) => {
  try {
    const { negotiation_id, wallet_address } = req.body;
    if (!negotiation_id || !wallet_address) {
      res.status(400).json({ error: 'Missing required fields: negotiation_id, wallet_address' });
      return;
    }
    const result = walkAway(negotiation_id, wallet_address);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/status/:id', (req: Request, res: Response) => {
  try {
    const result = getNegotiationStatus(req.params.id as string);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
