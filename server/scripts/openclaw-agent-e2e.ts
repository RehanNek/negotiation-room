import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';

type JsonObject = Record<string, unknown>;

interface ApiErrorShape {
  error?: string;
  code?: string;
}

function randomPrivateKey(): `0x${string}` {
  return `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
}

function assertObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected API response shape');
  }
  return value as JsonObject;
}

async function requestJson(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST',
  token?: string,
  body?: JsonObject
): Promise<JsonObject> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const contentType = response.headers.get('content-type') || '';
  const parsed = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    if (typeof parsed === 'string') {
      throw new Error(`${method} ${path} failed (${response.status}): ${parsed}`);
    }
    const errObj = parsed as ApiErrorShape;
    throw new Error(
      `${method} ${path} failed (${response.status}): ${errObj.error || response.statusText}`
    );
  }

  return assertObject(parsed);
}

async function authenticate(baseUrl: string, privateKey: `0x${string}`): Promise<{ token: string; wallet: string }> {
  const account = privateKeyToAccount(privateKey);
  const wallet = account.address.toLowerCase();

  const challenge = await requestJson(baseUrl, '/auth/challenge', 'POST', undefined, {
    wallet_address: wallet,
  });
  const nonce = String(challenge.nonce || '');
  const message = String(challenge.message || '');
  if (!nonce || !message) throw new Error('Auth challenge did not return nonce/message');

  const signature = await account.signMessage({ message });
  const session = await requestJson(baseUrl, '/auth/verify', 'POST', undefined, {
    wallet_address: wallet,
    nonce,
    signature,
  });

  const token = String(session.token || '');
  if (!token) throw new Error('Auth verify did not return bearer token');

  return { token, wallet };
}

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const agentAPrivateKey = (process.env.AGENT_A_PRIVATE_KEY as `0x${string}` | undefined) || randomPrivateKey();
  const agentBPrivateKey = (process.env.AGENT_B_PRIVATE_KEY as `0x${string}` | undefined) || randomPrivateKey();

  console.log(`Base URL: ${baseUrl}`);
  console.log('Authenticating agent wallets...');
  const [agentA, agentB] = await Promise.all([
    authenticate(baseUrl, agentAPrivateKey),
    authenticate(baseUrl, agentBPrivateKey),
  ]);
  console.log(`Agent A: ${agentA.wallet}`);
  console.log(`Agent B: ${agentB.wallet}`);

  const created = await requestJson(baseUrl, '/negotiate/create', 'POST', agentA.token, {
    deal_type: 'service',
    category: 'openclaw-agent-service',
    params: {},
    constraints: {
      max_budget: 250,
      deadline: '2026-02-24',
      acceptance_rule: 'receiver approval',
    },
  });

  const roomId = String(created.room_id || '');
  if (!roomId) throw new Error('Create negotiation did not return room_id');
  console.log(`Room created: ${roomId}`);

  await requestJson(baseUrl, '/negotiate/join', 'POST', agentB.token, {
    room_id: roomId,
    constraints: {
      min_fee: 220,
      preferred_timeline: '3 days',
    },
  });
  console.log('Agent B joined room.');

  await requestJson(baseUrl, '/negotiate/offer', 'POST', agentA.token, {
    negotiation_id: roomId,
    structured: true,
    offer: {
      service: 'dataset labeling',
      deliverables: '10k rows labeled with taxonomy v1',
      price_amount: 250,
      currency: 'USD',
      timeline: '3 days',
      payment_terms: 'escrow locked until receiver affirmation',
      acceptance_criteria: 'quality score >= 98%',
    },
  });
  await requestJson(baseUrl, '/negotiate/offer', 'POST', agentB.token, {
    negotiation_id: roomId,
    structured: true,
    offer: {
      service: 'dataset labeling',
      deliverables: '10k rows labeled with taxonomy v1',
      price_amount: 240,
      currency: 'USD',
      timeline: '3 days',
      acceptance_criteria: 'quality score >= 98%',
      notes: 'Proceed if escrow is funded',
    },
  });
  console.log('Both offers submitted.');

  const doneA = await requestJson(baseUrl, '/negotiate/done', 'POST', agentA.token, {
    negotiation_id: roomId,
    escrow_amount_eth: '0.01',
  });

  let finalDone = doneA;
  if (doneA.status === 'awaiting_other_party_confirmation') {
    const termsHash = String(doneA.terms_hash || '');
    if (!termsHash) throw new Error('Missing terms_hash from first done response');

    finalDone = await requestJson(baseUrl, '/negotiate/done', 'POST', agentB.token, {
      negotiation_id: roomId,
      terms_hash: termsHash,
      escrow_amount_eth: '0.01',
    });
  }

  if (finalDone.status !== 'deal') {
    throw new Error(`Expected final done status=deal, got ${String(finalDone.status)}`);
  }

  const contract = assertObject(finalDone.contract);
  const contractId = String(contract.id || '');
  if (!contractId) throw new Error('Deal response missing contract.id');
  console.log(`Contract created: ${contractId}`);

  try {
    const escrowPrepared = await requestJson(
      baseUrl,
      `/contract/${contractId}/escrow/prepare`,
      'POST',
      agentA.token,
      {}
    );
    const escrow = assertObject(escrowPrepared.escrow);
    const fundTx = assertObject(escrowPrepared.fund_tx);
    console.log('Escrow prepared.');
    console.log(`Escrow status: ${String(escrow.status)}`);
    console.log(`Funding tx to=${String(fundTx.to)} value_wei=${String(fundTx.value_wei)}`);

    const prefundedTxHash = process.env.ESCROW_FUND_TX_HASH;
    if (prefundedTxHash) {
      await requestJson(baseUrl, `/contract/${contractId}/escrow/funded`, 'POST', agentA.token, {
        tx_hash: prefundedTxHash,
      });
      console.log(`Escrow marked funded with tx ${prefundedTxHash}`);
    } else {
      console.log('ESCROW_FUND_TX_HASH not provided; skipping funded confirmation call.');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Escrow prepare/funding step skipped or failed: ${message}`);
  }

  const affirm = await requestJson(baseUrl, `/contract/${contractId}/affirm`, 'POST', agentA.token, {});
  const attestation = assertObject(affirm.attestation);
  const attestationId = String(attestation.id || '');
  if (!attestationId) throw new Error('Affirmation did not return attestation id');
  console.log(`Service affirmed. Attestation: ${attestationId}`);

  const verification = await requestJson(baseUrl, `/attestation/${attestationId}/verify`, 'GET');
  console.log(`Verification valid: ${String(verification.valid)}`);
  console.log('OpenClaw E2E flow complete.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
