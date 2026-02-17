import { contractStatusCopy, inferAttestationVerdict, negotiationStatusCopy, verdictStatusCopy } from '@/lib/status';
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
      label: 'Action Needed',
      tone: 'warning',
      description: 'Run the rule check to decide the outcome.',
    });
    expect(contractStatusCopy('resolved')).toEqual({
      label: 'Completed',
      tone: 'success',
      description: 'Final outcome is recorded with proof.',
    });
  });

  it('maps condition verdict values and fallback', () => {
    expect(verdictStatusCopy('TRUE')).toEqual({
      label: 'Rule Passed',
      tone: 'success',
      description: 'The contract rule evaluated to true.',
    });
    expect(verdictStatusCopy('FALSE')).toEqual({
      label: 'Rule Failed',
      tone: 'danger',
      description: 'The contract rule evaluated to false.',
    });
    expect(verdictStatusCopy(undefined)).toEqual({
      label: 'Pending',
      tone: 'warning',
      description: 'Outcome has not been finalized yet.',
    });
  });

  it('infers service affirmation verdict when payload verdict is missing', () => {
    expect(
      inferAttestationVerdict({
        type: 'service_affirmation',
        payload: { action: 'service_delivery_affirmed' },
      })
    ).toBe('TRUE');
    expect(
      inferAttestationVerdict({
        type: 'condition_resolution',
        payload: { verdict: 'FALSE' },
      })
    ).toBe('FALSE');
    expect(
      inferAttestationVerdict({
        type: 'deal_recorded',
        payload: {},
      })
    ).toBeUndefined();
  });
});
