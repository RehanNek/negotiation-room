import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config({ path: '../server/.env' });

dotenv.config();

const sepoliaRpcUrl =
  process.env.ESCROW_RPC_URL ||
  process.env.SEPOLIA_RPC_URL ||
  process.env.RPC_URL ||
  '';

const deployerPrivateKey =
  process.env.ESCROW_DEPLOYER_PRIVATE_KEY ||
  process.env.ESCROW_RELAYER_PRIVATE_KEY ||
  process.env.PRIVATE_KEY ||
  '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: sepoliaRpcUrl,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      chainId: 11155111,
    },
  },
};

export default config;
