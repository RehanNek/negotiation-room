import { canAdvanceFromSetup, parseContractFocus, resolveInitialStep, resolveStepAfterPath } from '@/lib/flow';
import { describe, expect, it } from 'vitest';

describe('flow helpers', () => {
  it('resolves initial step by wallet state', () => {
    expect(resolveInitialStep(true)).toBe('path');
    expect(resolveInitialStep(false)).toBe('identity');
  });

  it('routes from path selection correctly', () => {
    expect(resolveStepAfterPath('create_custom')).toBe('setup');
    expect(resolveStepAfterPath('join_existing')).toBe('setup');
  });

  it('gates setup progression by required inputs', () => {
    expect(canAdvanceFromSetup('create_custom', false)).toBe(false);
    expect(canAdvanceFromSetup('join_existing', true)).toBe(true);
  });

  it('parses and sanitizes contract focus query params', () => {
    const withValues = new URLSearchParams('focus=contract-123&from=deal');
    expect(parseContractFocus(withValues)).toEqual({ focus: 'contract-123', from: 'deal' });

    const blankValues = new URLSearchParams();
    blankValues.set('focus', '   ');
    blankValues.set('from', '');
    expect(parseContractFocus(blankValues)).toEqual({ focus: null, from: null });
  });
});
