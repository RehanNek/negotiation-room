import { contractStatusCopy, negotiationStatusCopy, verdictStatusCopy } from '@/lib/status';
import { describe, expect, it } from 'vitest';

describe('status copy', () => {
  it('maps negotiation status to expected copy', () => {
    expect(negotiationStatusCopy('waiting')).toEqual({
      label: 'Waiting',
      tone: 'warning',
      description: 'Share the room code so the other party can join.',
    });
    expect(negotiationStatusCopy('deal')).toEqual({
      label: 'Deal Reached',
      tone: 'success',
      description: 'Done confirmed. Contract generation complete.',
    });
  });

  it('maps contract status to expected copy', () => {
    expect(contractStatusCopy('pending_resolution')).toEqual({
      label: 'Needs Resolution',
      tone: 'warning',
      description: 'Resolve condition and generate attested verdict.',
    });
    expect(contractStatusCopy('resolved')).toEqual({
      label: 'Resolved',
      tone: 'success',
      description: 'Final verdict and attestation are available.',
    });
  });

  it('maps condition verdict values and fallback', () => {
    expect(verdictStatusCopy('TRUE')).toEqual({
      label: 'Condition TRUE',
      tone: 'success',
      description: 'Condition evaluated as true from attested inputs.',
    });
    expect(verdictStatusCopy('FALSE')).toEqual({
      label: 'Condition FALSE',
      tone: 'danger',
      description: 'Condition evaluated as false from attested inputs.',
    });
    expect(verdictStatusCopy(undefined)).toEqual({
      label: 'Pending Verdict',
      tone: 'warning',
      description: 'Condition has not been finalized yet.',
    });
  });
});
