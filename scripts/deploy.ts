import { ethers, upgrades, network } from "hardhat";
import { confirmContinue, assertEnvironment } from "./utils";

assertEnvironment();

// Function declarations
async function deployPaycrest(): Promise<any> {
  await confirmContinue({
    contract: "Paycrest",
    network: network.name,
    chainId: network.config.chainId,
  });

  const factory = await ethers.getContractFactory("Paycrest");
  const contract = await upgrades.deployProxy(factory);

  const tx = await contract.deployTransaction.wait();
  
  console.log("✅ Deployed Paycrest: ", tx.transactionHash);

  // const implementationAddress = await contract.implementation();

  console.log(`Proxy Contract Address: ${contract.address}`);
  // console.log("Implementation Contract Address:", implementationAddress);

  return tx;
}

async function main() {
  // Deploy Paycrest
  await deployPaycrest();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
