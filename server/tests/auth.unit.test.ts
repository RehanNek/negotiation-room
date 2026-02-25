import { afterEach, describe, expect, it } from 'vitest';
import { createDemoSession } from '../src/services/auth';

const WALLET = '0x1111111111111111111111111111111111111111';

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.AUTH_DEMO_MODE;
const originalOverride = process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE;

function restoreEnv(): void {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalDemoMode === undefined) delete process.env.AUTH_DEMO_MODE;
  else process.env.AUTH_DEMO_MODE = originalDemoMode;

  if (originalOverride === undefined) delete process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE;
  else process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE = originalOverride;
}

afterEach(() => {
  restoreEnv();
});

describe('demo auth session policy', () => {
  it('allows explicit demo wallet override outside production by default', () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DEMO_MODE = 'true';
    delete process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE;

    const session = createDemoSession(WALLET);
    expect(session.wallet_address).toBe(WALLET.toLowerCase());
    expect(session.mode).toBe('demo');
  });

  it('blocks explicit demo wallet override in production unless enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_DEMO_MODE = 'true';
    delete process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE;

    expect(() => createDemoSession(WALLET)).toThrow('Demo wallet override is disabled');
  });

  it('allows explicit demo wallet override in production when env flag is true', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_DEMO_MODE = 'true';
    process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE = 'true';

    const session = createDemoSession(WALLET);
    expect(session.wallet_address).toBe(WALLET.toLowerCase());
  });

  it('rejects invalid wallet address when override is enabled', () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_DEMO_MODE = 'true';
    process.env.AUTH_DEMO_ALLOW_WALLET_OVERRIDE = 'true';

    expect(() => createDemoSession('not-a-wallet')).toThrow('wallet_address must be a valid EVM address');
  });
});
