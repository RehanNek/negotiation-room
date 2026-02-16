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

  it('rejects duplicate offers from the same party in one round', async () => {
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

    const duplicate = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenA))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 310, timeline: '2 weeks' },
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('already submitted');
  });

  it('blocks contract list access for a different wallet', async () => {
    const outsiderToken = await authTokenFor(outsiderWallet);

    const response = await request(app)
      .get(`/contract/wallet/${walletA}`)
      .set(authHeader(outsiderToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('own wallet contracts');
  });

  it('creates a contract when a deal converges', async () => {
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

    const second = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 390, timeline: '2 weeks' },
      });

    expect(second.status).toBe(200);
    expect(second.body.negotiation_status).toBe('deal');
    expect(second.body.contract?.id).toBeTruthy();
    expect(second.body.contract?.attestation_id).toBeTruthy();
    expect(second.body.contract?.terms?.party_a_offer?.price).toBe(400);
    expect(second.body.contract?.terms?.party_b_offer?.price).toBe(390);
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

    const second = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 495, timeline: '3 days' },
      });
    const contractId = second.body.contract?.id as string;
    const initialAttestationId = second.body.contract?.attestation_id as string;
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

    const verify = await request(app).get(`/attestation/${contract.body.attestation_id}/verify`);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
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
    const second = await request(app)
      .post('/negotiate/offer')
      .set(authHeader(tokenB))
      .send({
        negotiation_id: create.body.room_id,
        structured: true,
        offer: { price: 245, timeline: '1 week' },
      });
    const contractId = second.body.contract?.id as string;

    const affirm = await request(app)
      .post(`/contract/${contractId}/affirm`)
      .set(authHeader(tokenB))
      .send({});

    expect(affirm.status).toBe(403);
    expect(affirm.body.error).toContain('service receiver');
  });
});
