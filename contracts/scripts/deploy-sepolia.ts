import { ethers } from 'hardhat';
import { Wallet } from 'ethers';

async function main() {
  const verifierAddressFromEnv = process.env.ESCROW_VERIFIER_ADDRESS;
  const verifierPk = process.env.ESCROW_VERIFIER_PRIVATE_KEY;

  let verifierAddress = verifierAddressFromEnv;
  if (!verifierAddress && verifierPk) {
    verifierAddress = new Wallet(verifierPk).address;
  }

  if (!verifierAddress) {
    throw new Error('Set ESCROW_VERIFIER_ADDRESS or ESCROW_VERIFIER_PRIVATE_KEY before deploying EscrowVault.');
  }

  const [deployer] = await ethers.getSigners();
  console.log('Deploying EscrowVault...');
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Verifier: ${verifierAddress}`);

  const EscrowVault = await ethers.getContractFactory('EscrowVault');
  const vault = await EscrowVault.deploy(verifierAddress);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const network = await ethers.provider.getNetwork();

  console.log('EscrowVault deployed:');
  console.log(`Address: ${address}`);
  console.log(`ChainId: ${network.chainId.toString()}`);
  console.log('\nSet this in server/.env:');
  console.log(`ESCROW_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
