import { beforeEach, describe, expect, it, vi } from 'vitest';

const allMock = vi.fn();
const getMock = vi.fn();
const runMock = vi.fn();
const flushDbMock = vi.fn();
const readContractMock = vi.fn();

vi.mock('../src/db', () => ({
  all: (...args: unknown[]) => allMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  run: (...args: unknown[]) => runMock(...args),
  flushDb: (...args: unknown[]) => flushDbMock(...args),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: (...args: unknown[]) => readContractMock(...args),
    })),
  };
});

import { runEscrowSchedulerTickForTest } from '../src/services/escrow';

describe('escrow scheduler performance paths', () => {
  beforeEach(() => {
    allMock.mockReset();
    getMock.mockReset();
    runMock.mockReset();
    flushDbMock.mockReset();
    readContractMock.mockReset();
    process.env.ESCROW_ENABLED = 'true';
    process.env.ESCROW_RPC_URL = 'http://127.0.0.1:8545';
  });

  it('preloads attestation hashes via join and avoids per-row lookup queries', async () => {
    allMock.mockReturnValue([
      {
        id: 'escrow-1',
        contract_id: 'contract-1',
        deal_hash: '0xabc',
        status: 'failed',
        chain_id: 11155111,
        amount_wei: '100',
        payer_wallet: '0x111',
        recipient_if_true_wallet: '0x222',
        recipient_if_false_wallet: '0x111',
        timeout_at: '2099-01-01T00:00:00.000Z',
        contract_address: '0x999',
        fund_tx_hash: null,
        fund_block_number: null,
        settle_tx_hash: null,
        refund_tx_hash: null,
        attestation_id: null,
        last_error: null,
        created_at: '2026-02-18T00:00:00.000Z',
        updated_at: '2026-02-18T00:00:00.000Z',
        contract_status: 'active',
        contract_verdict: null,
        contract_attestation_id: null,
        contract_attestation_data_hash: null,
      },
    ]);

    await runEscrowSchedulerTickForTest();

    expect(allMock).toHaveBeenCalledTimes(1);
    expect(String(allMock.mock.calls[0][0])).toContain('LEFT JOIN attestations');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('reconciles stale funded rows that already have settlement tx data', async () => {
    allMock.mockReturnValue([
      {
        id: 'escrow-1',
        contract_id: 'contract-1',
        deal_hash: '0xabc',
        status: 'funded',
        chain_id: 11155111,
        amount_wei: '100',
        payer_wallet: '0x111',
        recipient_if_true_wallet: '0x222',
        recipient_if_false_wallet: '0x111',
        timeout_at: '2099-01-01T00:00:00.000Z',
        contract_address: '0x999',
        fund_tx_hash: '0xfund',
        fund_block_number: 100,
        settle_tx_hash: '0xsettle',
        refund_tx_hash: null,
        attestation_id: null,
        last_error: 'The contract function "settleDeal" reverted with 0xe20d8067',
        created_at: '2026-02-18T00:00:00.000Z',
        updated_at: '2026-02-18T00:00:00.000Z',
        contract_status: 'active',
        contract_verdict: null,
        contract_attestation_id: 'att-1',
        contract_attestation_data_hash: null,
      },
    ]);
    readContractMock.mockResolvedValue([
      100n,
      '0x111',
      '0x222',
      '0x111',
      0n,
      true,
      true,
      false,
      true,
      100n,
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      1n,
    ]);

    await runEscrowSchedulerTickForTest();

    expect(readContractMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, attestation_id = COALESCE(?, attestation_id), last_error = NULL'),
      ['released', 'att-1', 'contract-1']
    );
    expect(flushDbMock).toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });
});
