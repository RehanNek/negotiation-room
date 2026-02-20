import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import request from 'supertest';
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-room-tests-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'room.db');
process.env.GRANT_MESSAGE = '';
process.env.GRANT_SIGNATURE = '';
process.env.GRANT_WALLET = '';
process.env.AUTH_DEMO_MODE = 'true';
process.env.ESCROW_CHAIN_ID = '11155111';
process.env.ESCROW_VERIFIER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1';

const walletA = '0x1111111111111111111111111111111111111111';
const walletB = '0x2222222222222222222222222222222222222222';
const outsiderWallet = '0x3333333333333333333333333333333333333333';

let app: Express;
let runQuery: (sql: string, params?: any[]) => void;

async function authTokenFor(wallet: string): Promise<string> {
  const response = await request(app).post('/auth/demo').send({ wallet_address: wallet });
  expect(response.status).toBe(200);
  expect(response.body.token).toBeTruthy();
  return response.body.token as string;
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function confirmDeal(negotiationId: string, firstToken: string, secondToken: string) {
  const first = await request(app)
    .post('/negotiate/done')
    .set(authHeader(firstToken))
    .send({
      negotiation_id: negotiationId,
      escrow_amount_eth: '0.01',
    });
  expect(first.status).toBe(200);

  if (first.body.status === 'deal') {
    return first;
  }

  expect(first.body.status).toBe('awaiting_other_party_confirmation');
  expect(first.body.terms_hash).toBeTruthy();

  const second = await request(app)
    .post('/negotiate/done')
    .set(authHeader(secondToken))
    .send({
      negotiation_id: negotiationId,
      terms_hash: first.body.terms_hash,
      escrow_amount_eth: '0.01',
    });

  expect(second.status).toBe(200);
  expect(second.body.status).toBe('deal');
  return second;
}

beforeAll(async () => {
  const appModule = await import('../src/app');
  const dbModule = await import('../src/db');

  app = await appModule.createApp();
  runQuery = dbModule.run;
});

beforeEach(() => {
  runQuery('DELETE FROM rounds');
  runQuery('DELETE FROM conditions');
  runQuery('DELETE FROM attestations');
  runQuery('DELETE FROM contracts');
  runQuery('DELETE FROM negotiations');
  runQuery('DELETE FROM reputation');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Negotiation API', () => {
  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('the-room');
  });

  it('creates a signature-backed session from challenge + signed message', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f094538f5d4f3f9342a9a5a4f3c5e6d2f6d9c3f1'
    );

    const challenge = await request(app).post('/auth/challenge').send({ wallet_address: account.address });
    expect(challenge.status).toBe(200);
    expect(challenge.body.nonce).toBeTruthy();

    const signature = await account.signMessage({ message: challenge.body.message });
    const verify = await request(app).post('/auth/verify').send({
      wallet_address: account.address,
      nonce: challenge.body.nonce,
      signature,
    });

    expect(verify.status).toBe(200);
    expect(verify.body.mode).toBe('signature');
    expect(verify.body.token).toBeTruthy();
  });

  it('requires authorization for protected negotiation routes', async () => {
    const response = await request(app).post('/negotiate/create').send({
      deal_type: 'service',
      category: 'web-development',
      params: {},
      constraints: {},
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing Bearer token');
  });

  it('returns a structured bad request for missing fields', async () => {
    const token = await authTokenFor(walletA);
    const response = await request(app)
      .post('/negotiate/create')
      .set(authHeader(token))
      .send({
        deal_type: 'service',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required fields');
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('creates a room and allows a second wallet to join', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'web-development',
        params: { scope: 'landing page' },
        constraints: { max_budget: 500 },
      });
    expect(create.status).toBe(200);
    expect(create.body.negotiation.status).toBe('waiting');
    expect(create.body.negotiation.party_a_wallet).toBe(walletA);

    const join = await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: { min_price: 200 },
      });
    expect(join.status).toBe(200);
    expect(join.body.negotiation.status).toBe('active');

    const status = await request(app)
      .get(`/negotiate/status/${create.body.room_id}`)
      .set(authHeader(tokenA));
    expect(status.status).toBe(200);
    expect(status.body.party_a_wallet).toBe(walletA);
    expect(status.body.party_b_wallet).toBe(walletB);
  });

  it('rejects offers from wallets that are not participants', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);
    const outsiderToken = await authTokenFor(outsiderWallet);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'consulting',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    const outsiderOffer = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(outsiderToken))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 100 },
      });

    expect(outsiderOffer.status).toBe(403);
    expect(outsiderOffer.body.error).toContain('not a participant');
  });

  it('prevents non-participants from reading negotiation status', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);
    const outsiderToken = await authTokenFor(outsiderWallet);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'research',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    const outsiderStatus = await request(app)
      .get(`/negotiate/status/${create.body.room_id}`)
      .set(authHeader(outsiderToken));
    expect(outsiderStatus.status).toBe(403);
    expect(outsiderStatus.body.error).toContain('not a participant');
  });

  it('allows sequential messages from the same party without round lock', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'design',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    const first = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 300, timeline: '2 weeks' },
      });
    expect(first.status).toBe(200);

    const secondMessage = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 310, timeline: '2 weeks' },
      });

    expect(secondMessage.status).toBe(200);
    expect(secondMessage.body.negotiation_status).toBe('active');
    expect(secondMessage.body.round?.round_number).toBe(2);
  });

  it('blocks contract list access for a different wallet', async () => {
    const outsiderToken = await authTokenFor(outsiderWallet);

    const response = await request(app)
      .get(`/contract/wallet/${walletA}`)
      .set(authHeader(outsiderToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('own wallet contracts');
  });

  it('creates a contract when a participant marks the negotiation done', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'copywriting',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 400, timeline: '2 weeks' },
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 390, timeline: '2 weeks' },
      });

    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);

    expect(done.status).toBe(200);
    expect(done.body.status).toBe('deal');
    expect(done.body.contract?.id).toBeTruthy();
    expect(done.body.contract?.attestation_id).toBeTruthy();
    expect(done.body.contract?.terms?.party_a_offer?.price).toBe(400);
    expect(done.body.contract?.terms?.party_b_offer?.price).toBe(390);
    expect(done.body.contract?.terms?.agreed_terms?.price_amount).toBe(400);
    expect(done.body.contract?.terms?.agreed_terms?.timeline).toBe('2 weeks');
    expect(done.body.contract?.terms?.missing_terms).toContain('deliverables');
  });

  it('requires dual done confirmations with matching terms hash before creating contract', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'research',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'I can do this for $250 in 5 days.',
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Deal, let us do $250.',
      });

    const firstDone = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenA))
      .send({ negotiation_id: create.body.room_id, escrow_amount_eth: '0.01' });

    expect(firstDone.status).toBe(200);
    expect(firstDone.body.status).toBe('awaiting_other_party_confirmation');
    expect(firstDone.body.terms_hash).toBeTruthy();
    expect(firstDone.body.terms_draft).toBeTruthy();

    const secondDone = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        terms_hash: firstDone.body.terms_hash,
        escrow_amount_eth: '0.01',
      });
    expect(secondDone.status).toBe(200);
    expect(secondDone.body.status).toBe('deal');
    expect(secondDone.body.contract?.id).toBeTruthy();
  });

  it('requires escrow amount confirmation when marking done', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'advisory',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'I can do this for $250.',
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Deal.',
      });

    const doneWithoutAmount = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
      });

    expect(doneWithoutAmount.status).toBe(400);
    expect(doneWithoutAmount.body.error).toContain('escrow_amount_eth is required');
  });

  it('requires both parties to confirm the same escrow amount before deal finalization', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'consulting',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Let us close this at $250.',
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Agreed, done.',
      });

    const firstDone = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        escrow_amount_eth: '0.01',
      });
    expect(firstDone.status).toBe(200);
    expect(firstDone.body.status).toBe('awaiting_other_party_confirmation');
    expect(firstDone.body.terms_hash).toBeTruthy();

    const mismatchedSecondDone = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        terms_hash: firstDone.body.terms_hash,
        escrow_amount_eth: '0.02',
      });

    expect(mismatchedSecondDone.status).toBe(409);
    expect(mismatchedSecondDone.body.error).toContain('Escrow amount mismatch');
  });

  it('escrow prepare uses the ETH amount locked during done confirmation', async () => {
    const previousEscrowEnabled = process.env.ESCROW_ENABLED;
    const previousEscrowContract = process.env.ESCROW_CONTRACT_ADDRESS;
    const previousEscrowChain = process.env.ESCROW_CHAIN_ID;

    process.env.ESCROW_ENABLED = 'true';
    process.env.ESCROW_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
    process.env.ESCROW_CHAIN_ID = '11155111';

    try {
      const tokenA = await authTokenFor(walletA);
      const tokenB = await authTokenFor(walletB);

      const create = await request(app)
        .post('/negotiate/create')
        .set(authHeader(tokenA))
        .send({
          deal_type: 'service',
          category: 'consulting',
          params: {},
          constraints: {},
        });
      await request(app)
        .post('/negotiate/join')
        .set(authHeader(tokenB))
        .send({
          room_id: create.body.room_id,
          constraints: {},
        });

      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenA))
        .send({
          negotiation_id: create.body.room_id,
          offer: 'Scope has 6 milestones and 14 meetings. Budget headline is $250.',
        });
      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenB))
        .send({
          negotiation_id: create.body.room_id,
          offer: 'Agreed, proceed.',
        });

      const done = await request(app)
        .post('/negotiate/done')
        .set(authHeader(tokenA))
        .send({
          negotiation_id: create.body.room_id,
          escrow_amount_eth: '0.015',
        });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('awaiting_other_party_confirmation');

      const finalDone = await request(app)
        .post('/negotiate/done')
        .set(authHeader(tokenB))
        .send({
          negotiation_id: create.body.room_id,
          terms_hash: done.body.terms_hash,
          escrow_amount_eth: '0.015',
        });
      expect(finalDone.status).toBe(200);
      expect(finalDone.body.status).toBe('deal');

      const contractId = finalDone.body.contract?.id as string;
      expect(contractId).toBeTruthy();

      const prepare = await request(app)
        .post(`/contract/${contractId}/escrow/prepare`)
        .set(authHeader(tokenA))
        .send({});

      expect(prepare.status).toBe(200);
      expect(prepare.body.escrow?.amount_wei).toBe('15000000000000000');
      expect(prepare.body.fund_tx?.value_wei).toBe('15000000000000000');
    } finally {
      process.env.ESCROW_ENABLED = previousEscrowEnabled;
      process.env.ESCROW_CONTRACT_ADDRESS = previousEscrowContract;
      process.env.ESCROW_CHAIN_ID = previousEscrowChain;
    }
  });

  it('defaults service escrow payer to the configured receiver wallet and releases to provider', async () => {
    const previousEscrowEnabled = process.env.ESCROW_ENABLED;
    const previousEscrowContract = process.env.ESCROW_CONTRACT_ADDRESS;
    const previousEscrowChain = process.env.ESCROW_CHAIN_ID;

    process.env.ESCROW_ENABLED = 'true';
    process.env.ESCROW_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
    process.env.ESCROW_CHAIN_ID = '11155111';

    try {
      const tokenA = await authTokenFor(walletA);
      const tokenB = await authTokenFor(walletB);

      const create = await request(app)
        .post('/negotiate/create')
        .set(authHeader(tokenA))
        .send({
          deal_type: 'service',
          category: 'consulting',
          params: {},
          constraints: {},
        });
      await request(app)
        .post('/negotiate/join')
        .set(authHeader(tokenB))
        .send({
          room_id: create.body.room_id,
          constraints: {},
        });

      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenA))
        .send({
          negotiation_id: create.body.room_id,
          offer: 'I can provide 4 strategy sessions. Payment from client escrow after approval.',
        });
      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenB))
        .send({
          negotiation_id: create.body.room_id,
          offer: 'Agreed. I am the receiver/client for this service.',
        });

      const firstDone = await request(app)
        .post('/negotiate/done')
        .set(authHeader(tokenA))
        .send({
          negotiation_id: create.body.room_id,
          escrow_amount_eth: '0.02',
        });
      expect(firstDone.status).toBe(200);

      const secondDone = await request(app)
        .post('/negotiate/done')
        .set(authHeader(tokenB))
        .send({
          negotiation_id: create.body.room_id,
          terms_hash: firstDone.body.terms_hash,
          escrow_amount_eth: '0.02',
        });
      expect(secondDone.status).toBe(200);
      expect(secondDone.body.status).toBe('deal');

      const contractId = secondDone.body.contract?.id as string;
      expect(contractId).toBeTruthy();

      const contract = await request(app)
        .get(`/contract/${contractId}`)
        .set(authHeader(tokenA));
      expect(contract.status).toBe(200);

      const nextTerms = {
        ...(contract.body.terms || {}),
        agreed_terms: {
          ...((contract.body.terms?.agreed_terms as Record<string, unknown>) || {}),
          receiver_wallet: walletB,
          provider_wallet: walletA,
        },
      };
      runQuery('UPDATE contracts SET terms = ? WHERE id = ?', [JSON.stringify(nextTerms), contractId]);

      const prepare = await request(app)
        .post(`/contract/${contractId}/escrow/prepare`)
        .set(authHeader(tokenB))
        .send({});

      expect(prepare.status).toBe(200);
      expect(prepare.body.escrow?.payer_wallet).toBe(walletB.toLowerCase());
      expect(prepare.body.escrow?.recipient_if_true_wallet).toBe(walletA.toLowerCase());
      expect(prepare.body.escrow?.recipient_if_false_wallet).toBe(walletB.toLowerCase());
    } finally {
      process.env.ESCROW_ENABLED = previousEscrowEnabled;
      process.env.ESCROW_CONTRACT_ADDRESS = previousEscrowContract;
      process.env.ESCROW_CHAIN_ID = previousEscrowChain;
    }
  });

  it('invalidates pending done confirmations when a new offer is submitted', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'editing',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Offer is $300 and 4 days.',
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Let us align at $300.',
      });

    const done = await request(app)
      .post('/negotiate/done')
      .set(authHeader(tokenA))
      .send({ negotiation_id: create.body.room_id, escrow_amount_eth: '0.01' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('awaiting_other_party_confirmation');

    const followUpOffer = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Actually make it $280 and we close.',
      });
    expect(followUpOffer.status).toBe(200);

    const status = await request(app)
      .get(`/negotiate/status/${create.body.room_id}`)
      .set(authHeader(tokenA));
    expect(status.status).toBe(200);
    expect(status.body.final_terms_hash).toBeNull();
    expect(status.body.party_a_confirmed_terms_hash).toBeNull();
    expect(status.body.party_b_confirmed_terms_hash).toBeNull();
  });

  it('rejects escrow prepare when onchain escrow is disabled', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'design',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Price 200 USD.',
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Agreed.',
      });

    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);
    const contractId = done.body.contract?.id as string;
    expect(contractId).toBeTruthy();

    const prepare = await request(app)
      .post(`/contract/${contractId}/escrow/prepare`)
      .set(authHeader(tokenA))
      .send({});

    expect(prepare.status).toBe(409);
    expect(prepare.body.error).toContain('disabled');
  });

  it('extracts deliverables, amount, and schedule details from free-form chat', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'music-lessons',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Need violin lessons. Deliverables: 3 recorded lessons. Budget is $220 and sessions on Mondays and Wednesdays at 5pm PST.',
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Agreed. I can deliver 3 recorded lessons in 10 days. payment terms: escrow released after approval.',
      });

    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);

    expect(done.status).toBe(200);
    expect(done.body.contract?.terms?.agreed_terms?.price_amount).toBe(220);
    expect(done.body.contract?.terms?.agreed_terms?.currency).toBe('USD');
    expect(done.body.contract?.terms?.agreed_terms?.deliverables).toContain('3 recorded lessons');
    expect(done.body.contract?.terms?.agreed_terms?.schedule).toContain('Mondays');
    expect(done.body.contract?.terms?.agreed_terms?.timeline).toContain('10 days');
    expect(done.body.contract?.terms?.missing_terms || []).toEqual([]);
  });

  it('selects the agreed final price instead of aggregating unrelated numeric mentions', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'consulting',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Initial scope has 6 milestones over 14 days. Budget options are $1200 or $980.',
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Can do it in 5 days at $400.',
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Let us agree and close at $250, done.',
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        offer: 'Agreed, proceed at $250.',
      });

    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);

    expect(done.status).toBe(200);
    expect(done.body.contract?.terms?.agreed_terms?.price_amount).toBe(250);
    expect(done.body.contract?.terms?.agreed_terms?.currency).toBe('USD');
  });

  it('allows the service receiver to affirm delivery and generate attestation', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'data-labeling',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 500, timeline: '3 days' },
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 495, timeline: '3 days' },
      });
    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);
    const contractId = done.body.contract?.id as string;
    const initialAttestationId = done.body.contract?.attestation_id as string;
    expect(contractId).toBeTruthy();
    expect(initialAttestationId).toBeTruthy();

    const affirm = await request(app)
      .post(`/contract/${contractId}/affirm`)
      .set(authHeader(tokenA))
      .send({});

    expect(affirm.status).toBe(200);
    expect(affirm.body.verdict).toBe('TRUE');
    expect(affirm.body.attestation?.id).toBeTruthy();

    const contract = await request(app)
      .get(`/contract/${contractId}`)
      .set(authHeader(tokenA));
    expect(contract.status).toBe(200);
    expect(contract.body.status).toBe('resolved');
    expect(contract.body.attestation_id).toBeTruthy();
    expect(contract.body.attestation_id).not.toBe(initialAttestationId);

    const proof = await request(app).get(`/attestation/${contract.body.attestation_id}`);
    expect(proof.status).toBe(200);
    expect(proof.body.hash_algo).toBe('sha256-rfc8785');
    expect(proof.body.sig_type).toBe('eip712');
    expect(proof.body.signer_wallet).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(proof.body.signature).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(proof.body.sig_domain?.name).toBe('NegotiationRoomAttestation');
    expect(proof.body.sig_message?.attestationId).toBe(contract.body.attestation_id);
    expect(proof.body.sig_message?.contractId).toBe(contractId);
    expect(proof.body.sig_message?.dataHash).toBe(proof.body.data_hash);

    const verify = await request(app).get(`/attestation/${contract.body.attestation_id}/verify`);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.attestation?.type).toBe('service_affirmation');
    expect(verify.body.attestation?.payload?.action).toBe('service_delivery_affirmed');
    expect(verify.body.attestation?.payload?.verdict).toBe('TRUE');
  });

  it('fails attestation verification after payload tampering', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'data-labeling',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 500, timeline: '3 days' },
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 495, timeline: '3 days' },
      });

    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);
    const contractId = done.body.contract?.id as string;
    const attestationId = done.body.contract?.attestation_id as string;
    expect(contractId).toBeTruthy();
    expect(attestationId).toBeTruthy();

    runQuery('UPDATE attestations SET payload = ? WHERE id = ?', [
      JSON.stringify({
        contract_id: contractId,
        tampered: true,
      }),
      attestationId,
    ]);

    const verify = await request(app).get(`/attestation/${attestationId}/verify`);
    expect(verify.status).toBe(404);
    expect(verify.body.error).toContain('invalid');
  });

  it('forbids service providers from affirming escrow release', async () => {
    const tokenA = await authTokenFor(walletA);
    const tokenB = await authTokenFor(walletB);

    const create = await request(app)
      .post('/negotiate/create')
      .set(authHeader(tokenA))
      .send({
        deal_type: 'service',
        category: 'qa-testing',
        params: {},
        constraints: {},
      });
    await request(app)
      .post('/negotiate/join')
      .set(authHeader(tokenB))
      .send({
        room_id: create.body.room_id,
        constraints: {},
      });

    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 250, timeline: '1 week' },
      });
    await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 245, timeline: '1 week' },
      });
    const done = await confirmDeal(create.body.room_id, tokenA, tokenB);
    const contractId = done.body.contract?.id as string;

    const affirm = await request(app)
      .post(`/contract/${contractId}/affirm`)
      .set(authHeader(tokenB))
      .send({});

    expect(affirm.status).toBe(403);
    expect(affirm.body.error).toContain('service receiver');
  });

  it('binds service affirmation authority to the escrow payer once escrow is prepared', async () => {
    const previousEscrowEnabled = process.env.ESCROW_ENABLED;
    const previousEscrowContract = process.env.ESCROW_CONTRACT_ADDRESS;
    const previousEscrowChain = process.env.ESCROW_CHAIN_ID;

    process.env.ESCROW_ENABLED = 'true';
    process.env.ESCROW_CONTRACT_ADDRESS = '0x000000000000000000000000000000000000dEaD';
    process.env.ESCROW_CHAIN_ID = '11155111';

    try {
      const tokenA = await authTokenFor(walletA);
      const tokenB = await authTokenFor(walletB);

      const create = await request(app)
        .post('/negotiate/create')
        .set(authHeader(tokenA))
        .send({
          deal_type: 'service',
          category: 'qa-testing',
          params: {},
          constraints: {},
        });
      await request(app)
        .post('/negotiate/join')
        .set(authHeader(tokenB))
        .send({
          room_id: create.body.room_id,
          constraints: {},
        });

      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenA))
        .send({
          negotiation_id: create.body.room_id,
          structured: true,
          offer: { price: 250, timeline: '1 week' },
        });
      await request(app)
        .post('/negotiate/offer')
        .set(authHeader(tokenB))
        .send({
          negotiation_id: create.body.room_id,
          structured: true,
          offer: { price: 245, timeline: '1 week' },
        });

      const done = await confirmDeal(create.body.room_id, tokenA, tokenB);
      const contractId = done.body.contract?.id as string;
      expect(contractId).toBeTruthy();

      const contract = await request(app)
        .get(`/contract/${contractId}`)
        .set(authHeader(tokenA));
      expect(contract.status).toBe(200);

      const tamperedTerms = {
        ...(contract.body.terms || {}),
        agreed_terms: {
          ...((contract.body.terms?.agreed_terms as Record<string, unknown>) || {}),
          receiver_wallet: walletB,
          provider_wallet: walletA,
        },
      };
      runQuery('UPDATE contracts SET terms = ? WHERE id = ?', [JSON.stringify(tamperedTerms), contractId]);

      const prepare = await request(app)
        .post(`/contract/${contractId}/escrow/prepare`)
        .set(authHeader(tokenA))
        .send({});
      expect(prepare.status).toBe(200);
      expect(prepare.body.escrow?.payer_wallet).toBe(walletA.toLowerCase());

      const affirmByCounterparty = await request(app)
        .post(`/contract/${contractId}/affirm`)
        .set(authHeader(tokenB))
        .send({});

      expect(affirmByCounterparty.status).toBe(403);
      expect(affirmByCounterparty.body.error).toContain('escrow payer');
    } finally {
      process.env.ESCROW_ENABLED = previousEscrowEnabled;
      process.env.ESCROW_CONTRACT_ADDRESS = previousEscrowContract;
      process.env.ESCROW_CHAIN_ID = previousEscrowChain;
    }
  });
});
