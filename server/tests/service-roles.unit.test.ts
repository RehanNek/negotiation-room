import { describe, expect, it } from 'vitest';
import { resolveServiceRoles } from '../src/services/service-roles';

const partyA = '0x1111111111111111111111111111111111111111';
const partyB = '0x2222222222222222222222222222222222222222';
const outsider = '0x3333333333333333333333333333333333333333';

describe('service role resolver', () => {
  it('ignores non-participant provider wallet from terms', () => {
    const roles = resolveServiceRoles({
      partyAWallet: partyA,
      partyBWallet: partyB,
      terms: {
        receiver_wallet: partyB,
        provider_wallet: outsider,
      },
      agreedTerms: {},
    });

    expect(roles.receiverWallet).toBe(partyB);
    expect(roles.providerWallet).toBe(partyA);
  });

  it('ignores non-participant receiver wallet from terms', () => {
    const roles = resolveServiceRoles({
      partyAWallet: partyA,
      partyBWallet: partyB,
      terms: {
        receiver_wallet: outsider,
        provider_wallet: partyA,
      },
      agreedTerms: {},
    });

    expect(roles.receiverWallet).toBe(partyB);
    expect(roles.providerWallet).toBe(partyA);
  });

  it('falls back to participant defaults when both explicit roles are non-participants', () => {
    const roles = resolveServiceRoles({
      partyAWallet: partyA,
      partyBWallet: partyB,
      terms: {
        receiver_wallet: outsider,
        provider_wallet: outsider,
      },
      agreedTerms: {},
    });

    expect(roles.receiverWallet).toBe(partyA);
    expect(roles.providerWallet).toBe(partyB);
  });
});
