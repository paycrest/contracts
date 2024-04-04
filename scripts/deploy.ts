import { ethers, upgrades, network } from "hardhat";
import { confirmContinue, assertEnvironment } from "./utils";

assertEnvironment();

// Function declarations
async function deployGateway(): Promise<any> {
  await confirmContinue({
    contract: "Gateway",
    network: network.name,
    chainId: network.config.chainId,
  });

  const factory = await ethers.getContractFactory("Gateway");
  const contract = await upgrades.deployProxy(factory);

  const tx = await contract.deployTransaction.wait();
  
  console.log("✅ Deployed Gateway: ", tx.transactionHash);

  // const implementationAddress = await contract.implementation();

  console.log(`Proxy Contract Address: ${contract.address}`);
  // console.log("Implementation Contract Address:", implementationAddress);

  return tx;
}

async function main() {
  // Deploy Gateway
  await deployGateway();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
