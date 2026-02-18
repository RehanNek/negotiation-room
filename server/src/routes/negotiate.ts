import { Router } from 'express';
import { createNegotiation, finalizeNegotiationDeal, joinNegotiation, submitOffer, walkAway, getNegotiationStatus } from '../services/negotiation';
import { badRequest } from '../errors';
import { requireAuth } from '../services/auth';
import { requireBodyFields, route } from './utils';

const router = Router();

router.post('/create', requireAuth, route((req, res) => {
  const { deal_type, category, params, constraints } = req.body;
  requireBodyFields(req.body, ['deal_type', 'category']);
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = createNegotiation({
    deal_type,
    category,
    params: params || {},
    wallet_address: req.authWallet,
    constraints: constraints || {},
  });
  res.json(result);
}));

router.post('/join', requireAuth, route((req, res) => {
  const { room_id, constraints } = req.body;
  requireBodyFields(req.body, ['room_id']);
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = joinNegotiation({ room_id, wallet_address: req.authWallet, constraints: constraints || {} });
  res.json(result);
}));

router.post('/offer', requireAuth, route(async (req, res) => {
  const { negotiation_id, offer, structured } = req.body;
  requireBodyFields(req.body, ['negotiation_id', 'offer']);
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = await submitOffer({ negotiation_id, wallet_address: req.authWallet, offer, structured });
  res.json(result);
}));

router.post('/walkaway', requireAuth, route((req, res) => {
  const { negotiation_id } = req.body;
  requireBodyFields(req.body, ['negotiation_id']);
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = walkAway(negotiation_id, req.authWallet);
  res.json(result);
}));

router.post('/done', requireAuth, route(async (req, res) => {
  const { negotiation_id, terms_hash, escrow_amount_eth, timeline, deliverables, notes } = req.body;
  requireBodyFields(req.body, ['negotiation_id']);
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = await finalizeNegotiationDeal(
    negotiation_id,
    req.authWallet,
    typeof terms_hash === 'string' ? terms_hash : undefined,
    typeof escrow_amount_eth === 'string' ? escrow_amount_eth : undefined,
    {
      timeline: typeof timeline === 'string' ? timeline : undefined,
      deliverables: typeof deliverables === 'string' ? deliverables : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    }
  );
  res.json(result);
}));

router.get('/status/:id', requireAuth, route((req, res) => {
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = getNegotiationStatus(req.params.id as string, req.authWallet);
  res.json(result);
}));

export default router;
