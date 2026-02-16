import { Router, Request, Response } from 'express';
import { getAttestation, verifyAttestation } from '../services/attestation';

const router = Router();

router.get('/:id', (req: Request, res: Response) => {
  try {
    const attestation = getAttestation(req.params.id as string);
    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }
    res.json(attestation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/verify', (req: Request, res: Response) => {
  try {
    const result = verifyAttestation(req.params.id as string);
    if (!result.valid) {
      res.status(404).json({ error: 'Attestation not found or invalid' });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
