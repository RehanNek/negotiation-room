// Run this once to generate your grant signature:
//   npx tsx sign-grant.ts YOUR_METAMASK_PRIVATE_KEY
//
// Then add the output values to your .env file

import { privateKeyToAccount } from 'viem/accounts';

const WALLET_ADDRESS = '0xb2E03E906683521Ad4B2B2CC7428b5a3F3DB3399';
const SERVER_URL = 'https://determinal-api.eigenarcade.com';

async function main() {
  const privateKey = process.argv[2];
  if (!privateKey) {
    console.error('Usage: npx tsx sign-grant.ts 0xYOUR_PRIVATE_KEY');
    process.exit(1);
  }

  // Step 1: Get grant message
  const msgRes = await fetch(`${SERVER_URL}/message?address=${WALLET_ADDRESS}`);
  const msgData = await msgRes.json();
  console.log('Grant message:', msgData.message);

  // Step 2: Sign it
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const signature = await account.signMessage({ message: msgData.message });
  console.log('Signature:', signature);

  // Step 3: Test it
  const testRes = await fetch(`${SERVER_URL}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      model: 'gpt-oss-120b-f16',
      max_tokens: 50,
      seed: 0,
      grantMessage: msgData.message,
      grantSignature: signature,
      walletAddress: WALLET_ADDRESS,
    }),
  });
  const testData = await testRes.json();
  console.log('\nTest response:', JSON.stringify(testData, null, 2));

  console.log('\n\n=== Add these to your server/.env ===');
  console.log(`GRANT_MESSAGE=${msgData.message}`);
  console.log(`GRANT_SIGNATURE=${signature}`);
  console.log(`GRANT_WALLET=${WALLET_ADDRESS}`);
}

main().catch(console.error);
