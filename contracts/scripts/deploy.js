const { ethers, network } = require("hardhat");

async function main() {
  if (network.name !== "goatTestnet" || network.config.chainId !== 48816) {
    throw new Error("Refusing deployment: select the official GOAT Testnet3 network only");
  }
  const Escrow = await ethers.getContractFactory("BountiqEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  console.log(`BountiqEscrow deployed at ${address}`);
  console.log(`Explorer: https://explorer.testnet3.goat.network/address/${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
