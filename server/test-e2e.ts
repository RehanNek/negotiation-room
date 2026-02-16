// End-to-end negotiation test
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
  console.log('=========================================');
  console.log('  THE ROOM — End-to-End Negotiation Test');
  console.log('=========================================\n');

  // Health check
  const health = await api('/health');
  console.log('Server:', health.status, '\n');

  // 1. Create room
  console.log('1. Party A (Alice) creates a room');
  const room = await api('/negotiate/create', {
    deal_type: 'service',
    category: 'web-development',
    params: { scope: 'landing page with responsive design' },
    wallet_address: '0xAlice',
    constraints: { max_budget: 400, preferred_timeline: '2 weeks' },
  });
  console.log('   Room ID:', room.room_id);
  console.log('   Status:', room.negotiation.status, '\n');

  // 2. Join
  console.log('2. Party B (Bob) joins the room');
  const join = await api('/negotiate/join', {
    room_id: room.room_id,
    wallet_address: '0xBob',
    constraints: { min_price: 250, max_timeline: '3 weeks' },
  });
  console.log('   Status:', join.negotiation.status, '\n');

  // 3. Round 1
  console.log('3. Round 1');
  console.log('   Alice offers (plain English)...');
  const r1a = await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xAlice',
    offer: 'I can pay 280 dollars for a landing page, need it in 10 days',
  });
  console.log('   Alice parsed:', JSON.stringify(r1a.round.offer_structured));
  console.log('   AI suggestion:', r1a.suggestion?.suggestion?.slice(0, 100));
  console.log('');

  console.log('   Bob offers (structured JSON, agent-style)...');
  const r1b = await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xBob',
    structured: true,
    offer: { price: 380, timeline: '14 days', includes: 'responsive design + 1 revision' },
  });
  console.log('   Bob offer:', JSON.stringify(r1b.round.offer_structured));
  console.log('   Status:', r1b.negotiation_status, '\n');

  // 4. Round 2
  console.log('4. Round 2');
  console.log('   Alice raises (plain English)...');
  const r2a = await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xAlice',
    offer: 'I can go up to 330 dollars, 12 days, and I want 2 revisions',
  });
  console.log('   Alice parsed:', JSON.stringify(r2a.round.offer_structured));
  console.log('');

  console.log('   Bob lowers (structured)...');
  const r2b = await api('/negotiate/offer', {
    negotiation_id: room.room_id,
    wallet_address: '0xBob',
    structured: true,
    offer: { price: 340, timeline: '12 days', includes: 'responsive design + 2 revisions' },
  });
  console.log('   Bob offer:', JSON.stringify(r2b.round.offer_structured));
  console.log('   Status:', r2b.negotiation_status);

  if (r2b.contract) {
    console.log('\n   CONTRACT CREATED!');
    console.log('   Contract ID:', r2b.contract.id);
    console.log('   Summary:', r2b.contract.summary);
    console.log('   Terms:', JSON.stringify(r2b.contract.terms));
  }
  console.log('');

  // 5. Full status
  console.log('5. Negotiation status');
  const status = await api(`/negotiate/status/${room.room_id}`);
  console.log('   Status:', status.status);
  console.log('   Rounds:', status.current_round, '/', status.max_rounds);
  for (const r of status.rounds) {
    console.log(`   R${r.round_number} Party ${r.party}:`, JSON.stringify(r.offer_structured));
  }
  console.log('');

  // If not deal yet, do round 3 with very close offers
  if (status.status === 'active') {
    console.log('6. Round 3 — Final push (very close offers)');
    const r3a = await api('/negotiate/offer', {
      negotiation_id: room.room_id,
      wallet_address: '0xAlice',
      structured: true,
      offer: { price: 335, timeline: '12 days', includes: 'responsive design + 2 revisions' },
    });
    console.log('   Alice:', JSON.stringify(r3a.round.offer_structured));

    const r3b = await api('/negotiate/offer', {
      negotiation_id: room.room_id,
      wallet_address: '0xBob',
      structured: true,
      offer: { price: 335, timeline: '12 days', includes: 'responsive design + 2 revisions' },
    });
    console.log('   Bob:', JSON.stringify(r3b.round.offer_structured));
    console.log('   Status:', r3b.negotiation_status);

    if (r3b.contract) {
      console.log('\n   CONTRACT CREATED!');
      console.log('   Contract ID:', r3b.contract.id);
      console.log('   Summary:', r3b.contract.summary);
      console.log('   Terms:', JSON.stringify(r3b.contract.terms));
    }
    console.log('');
  }

  // 7. Reputation
  console.log('7. Reputation');
  const repA = await api('/reputation/0xAlice');
  const repB = await api('/reputation/0xBob');
  console.log('   Alice — Score:', repA.total_reputation, '| Deals:', repA.deals_completed, '| Good faith:', repA.good_faith_score);
  console.log('   Bob   — Score:', repB.total_reputation, '| Deals:', repB.deals_completed, '| Good faith:', repB.good_faith_score);
  console.log('');

  // 8. Leaderboard
  console.log('8. Leaderboard');
  const lb = await api('/reputation/leaderboard?limit=5');
  for (let i = 0; i < lb.length; i++) {
    console.log(`   ${i + 1}. ${lb[i].wallet_address}: ${lb[i].total_reputation} pts`);
  }

  console.log('\n=========================================');
  console.log('  Test complete!');
  console.log('=========================================');
}

main().catch(e => console.error('TEST FAILED:', e.message));
