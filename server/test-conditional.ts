// End-to-end conditional deal + resolution test
const BASE = 'http://localhost:3000';

async function api(path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function main() {
  console.log('=============================================');
  console.log('  Conditional Deal + Resolution + Attestation');
  console.log('=============================================\n');

  // 1. Create conditional room (crypto bet)
  console.log('1. Alice creates a conditional deal room');
  const room = await api('/negotiate/create', {
    deal_type: 'conditional',
    category: 'crypto-bet',
    params: {
      condition: 'Bitcoin price is above $90,000 USD',
      data_source: 'coingecko',
      resolution_date: '2026-03-01',
      scope: 'If condition is TRUE, Bob pays Alice 0.1 ETH. If FALSE, Alice pays Bob 0.1 ETH.',
    },
    wallet_address: '0xAlice',
    constraints: { believes_btc_above_90k: true },
  });
  console.log('   Room ID:', room.room_id);
  console.log('   Deal type:', room.negotiation.deal_type, '\n');

  // 2. Bob joins
  console.log('2. Bob joins');
  await api('/negotiate/join', {
    room_id: room.room_id,
    wallet_address: '0xBob',
    constraints: { believes_btc_above_90k: false },
  });
  console.log('   Joined\n');

  // 3. Quick negotiation — both agree on terms (structured, 2 rounds)
  console.log('3. Round 1 — Both submit terms');
  await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xAlice',
    structured: true,
    offer: { stake: '0.1 ETH', condition: 'BTC > $90k', coin_id: 'bitcoin' },
  });
  console.log('   Alice offered');

  const r1b = await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xBob',
    structured: true,
    offer: { stake: '0.1 ETH', condition: 'BTC > $90k', coin_id: 'bitcoin' },
  });
  console.log('   Bob offered');
  console.log('   Status:', r1b.negotiation_status);

  // If not deal yet, push one more round
  if (r1b.negotiation_status === 'active') {
    console.log('\n4. Round 2 — Identical offers to force deal');
    await api('/negotiate/offer', {
      negotiation_id: room.room_id,
      wallet_address: '0xAlice',
      structured: true,
      offer: { stake: '0.1 ETH', condition: 'BTC > $90k', coin_id: 'bitcoin' },
    });
    const r2b = await api('/negotiate/offer', {
      negotiation_id: room.room_id,
      wallet_address: '0xBob',
      structured: true,
      offer: { stake: '0.1 ETH', condition: 'BTC > $90k', coin_id: 'bitcoin' },
    });
    console.log('   Status:', r2b.negotiation_status);

    if (r2b.contract) {
      console.log('   Contract ID:', r2b.contract.id);
      console.log('   Contract status:', r2b.contract.status);
    }
  }

  // 5. Get the contract
  console.log('\n5. Fetching contract');
  const status = await api(`/negotiate/status/${room.room_id}`);
  // Find contract by wallet
  const contracts = await api('/contract/wallet/0xAlice');
  const conditional = contracts.find((c: any) => c.deal_type === 'conditional');

  if (!conditional) {
    console.log('   No conditional contract found yet. Negotiation status:', status.status);
    console.log('   (Need more rounds or convergence)');
    return;
  }

  console.log('   Contract ID:', conditional.id);
  console.log('   Status:', conditional.status);
  console.log('   Condition:', conditional.condition_desc);
  console.log('   Terms:', JSON.stringify(conditional.terms));

  // 6. Resolve the condition (fetches live BTC price from CoinGecko)
  console.log('\n6. Resolving condition (fetching live BTC price)...');
  const resolution = await api(`/contract/${conditional.id}/resolve`);
  console.log('   Verdict:', resolution.verdict);
  console.log('   Confidence:', resolution.confidence);
  console.log('   Reasoning:', resolution.reasoning);
  console.log('   External data:', JSON.stringify(resolution.external_data));
  console.log('   Attestation ID:', resolution.attestation.id);

  // 7. Verify attestation
  console.log('\n7. Verifying attestation...');
  const verification = await api(`/attestation/${resolution.attestation.id}/verify`);
  console.log('   Valid:', verification.valid);
  console.log('   Type:', verification.attestation.type);
  console.log('   Data hash:', verification.attestation.data_hash);
  console.log('   TEE signature:', verification.attestation.tee_signature.slice(0, 20) + '...');

  // 8. Check updated contract
  console.log('\n8. Updated contract');
  const updated = await api(`/contract/${conditional.id}`);
  console.log('   Status:', updated.status);
  console.log('   Verdict:', updated.verdict);
  console.log('   Attestation ID:', updated.attestation_id);

  // 9. Reputation
  console.log('\n9. Reputation');
  const repA = await api('/reputation/0xAlice');
  const repB = await api('/reputation/0xBob');
  console.log('   Alice — Score:', repA.total_reputation, '| Deals:', repA.deals_completed);
  console.log('   Bob   — Score:', repB.total_reputation, '| Deals:', repB.deals_completed);

  console.log('\n=============================================');
  console.log('  Conditional deal test complete!');
  console.log('=============================================');
}

main().catch(e => console.error('TEST FAILED:', e.message));
