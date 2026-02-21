import { describe, expect, it } from 'vitest';
import { resolveEscrowRouting } from '../src/services/escrow';

const partyA = '0x1111111111111111111111111111111111111111';
const partyB = '0x2222222222222222222222222222222222222222';

describe('escrow routing resolver', () => {
  it('derives service routing from receiver/provider roles', () => {
    const routing = resolveEscrowRouting({
      dealType: 'service',
      partyA,
      partyB,
      requesterWallet: partyB,
      terms: {},
      agreedTerms: {},
      serviceRoles: {
        receiverWallet: partyB,
        providerWallet: partyA,
      },
    });

    expect(routing.payerWallet).toBe(partyB.toLowerCase());
    expect(routing.recipientIfTrueWallet).toBe(partyA.toLowerCase());
    expect(routing.recipientIfFalseWallet).toBe(partyB.toLowerCase());
    expect(routing.issues).toEqual([]);
  });

  it('flags contradictory explicit payer/provider and requester mismatch', () => {
    const routing = resolveEscrowRouting({
      dealType: 'service',
      partyA,
      partyB,
      requesterWallet: partyA,
      terms: {},
      agreedTerms: {
        payer_wallet: partyA,
        provider_wallet: partyB,
      },
      serviceRoles: {
        receiverWallet: partyB,
        providerWallet: partyA,
      },
    });

    const codes = routing.issues.map((issue) => issue.code);
    expect(codes).toContain('service_explicit_payer_mismatch');
    expect(codes).toContain('service_explicit_provider_mismatch');
    expect(codes).toContain('service_requester_not_derived_payer');
    expect(routing.payerWallet).toBe(partyB.toLowerCase());
    expect(routing.recipientIfTrueWallet).toBe(partyA.toLowerCase());
    expect(routing.recipientIfFalseWallet).toBe(partyB.toLowerCase());
  });

  it('flags invariant violations when release and refund collapse', () => {
    const routing = resolveEscrowRouting({
      dealType: 'conditional',
      partyA,
      partyB,
      terms: {
        payer_wallet: partyA,
        recipient_if_true_wallet: partyA,
      },
      agreedTerms: {},
      serviceRoles: null,
    });

    const codes = routing.issues.map((issue) => issue.code);
    expect(codes).toContain('recipient_true_equals_payer');
    expect(codes).toContain('recipient_true_equals_recipient_false');
  });
});
