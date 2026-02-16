import { Router } from 'express';
import { getAttestation, verifyAttestation } from '../services/attestation';
import { notFound } from '../errors';
import { route } from './utils';

const router = Router();

router.get('/:id', route((req, res) => {
  const attestation = getAttestation(req.params.id as string);
  if (!attestation) throw notFound('Attestation not found');
  res.json(attestation);
}));

router.get('/:id/verify', route((req, res) => {
  const result = verifyAttestation(req.params.id as string);
  if (!result.valid) throw notFound('Attestation not found or invalid');
  res.json(result);
}));

export default router;
