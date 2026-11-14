require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const testnetUrl = process.env.GOAT_TESTNET_RPC_URL || "https://rpc.testnet3.goat.network";
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    goatTestnet: {
      url: testnetUrl,
      chainId: 48816,
      ...(deployerKey ? { accounts: [deployerKey] } : {}),
    },
  },
  etherscan: {
    customChains: [{
      network: "goatTestnet",
      chainId: 48816,
      urls: { apiURL: "https://explorer.testnet3.goat.network/api", browserURL: "https://explorer.testnet3.goat.network" },
    }],
  },
};
