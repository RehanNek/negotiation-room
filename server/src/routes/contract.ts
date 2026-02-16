import { Router } from 'express';
import { affirmServiceDelivery, getContract, getContractsByWallet, resolveCondition } from '../services/contract';
import { badRequest, forbidden, notFound } from '../errors';
import { requireAuth } from '../services/auth';
import { route } from './utils';

const router = Router();

router.get('/wallet/:wallet', requireAuth, route((req, res) => {
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const requestedWallet = String(req.params.wallet);
  if (requestedWallet.toLowerCase() !== req.authWallet.toLowerCase()) {
    throw forbidden('You can only access your own wallet contracts');
  }
  const contracts = getContractsByWallet(requestedWallet, req.authWallet);
  res.json(contracts);
}));

router.get('/:id', requireAuth, route((req, res) => {
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const contract = getContract(req.params.id as string, req.authWallet);
  if (!contract) throw notFound('Contract not found');
  res.json(contract);
}));

router.post('/:id/resolve', requireAuth, route(async (req, res) => {
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = await resolveCondition(req.params.id as string, req.authWallet);
  res.json(result);
}));

router.post('/:id/affirm', requireAuth, route((req, res) => {
  if (!req.authWallet) throw badRequest('No authenticated wallet found');
  const result = affirmServiceDelivery(req.params.id as string, req.authWallet);
  res.json(result);
}));

export default router;
