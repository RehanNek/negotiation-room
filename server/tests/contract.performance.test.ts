import { beforeEach, describe, expect, it, vi } from 'vitest';

const allMock = vi.fn();
const getEscrowByContractIdMock = vi.fn();
const toEscrowModelMock = vi.fn();

vi.mock('../src/db', () => ({
  all: (...args: unknown[]) => allMock(...args),
  get: vi.fn(),
  run: vi.fn(),
  flushDb: vi.fn(),
}));

vi.mock('../src/services/escrow', () => ({
  getEscrowByContractId: (...args: unknown[]) => getEscrowByContractIdMock(...args),
  toEscrowModel: (...args: unknown[]) => toEscrowModelMock(...args),
  tryAutoSettleEscrow: vi.fn(),
}));

import { getContractsByWallet } from '../src/services/contract';

describe('contract service performance paths', () => {
  beforeEach(() => {
    allMock.mockReset();
    getEscrowByContractIdMock.mockReset();
    toEscrowModelMock.mockReset();
  });

  it('batches escrow loading for wallet contract listings', () => {
    allMock.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT * FROM contracts')) {
        return [
          {
            id: 'contract-1',
            party_a_wallet: '0x111',
            party_b_wallet: '0x222',
            terms: '{"price":100}',
          },
          {
            id: 'contract-2',
            party_a_wallet: '0x111',
            party_b_wallet: '0x333',
            terms: '{"price":200}',
          },
        ];
      }

      if (sql.startsWith('SELECT * FROM escrows WHERE contract_id IN')) {
        return [
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
            timeout_at: '2026-02-18T00:00:00.000Z',
            contract_address: '0x999',
            fund_tx_hash: null,
            fund_block_number: null,
            settle_tx_hash: null,
            refund_tx_hash: null,
            attestation_id: null,
            last_error: null,
            created_at: '2026-02-18T00:00:00.000Z',
            updated_at: '2026-02-18T00:00:00.000Z',
          },
        ];
      }

      return [];
    });

    toEscrowModelMock.mockImplementation((row: Record<string, unknown>) => ({
      ...row,
      asset: 'ETH',
    }));

    const contracts = getContractsByWallet('0x111', '0x111');

    expect(allMock).toHaveBeenCalledTimes(2);
    expect(String(allMock.mock.calls[1][0])).toContain('contract_id IN (?, ?)');
    expect(getEscrowByContractIdMock).not.toHaveBeenCalled();
    expect(contracts).toHaveLength(2);
    expect(contracts[0].escrow?.contract_id).toBe('contract-1');
    expect(contracts[1].escrow).toBeUndefined();
  });
});
