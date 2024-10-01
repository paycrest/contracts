import { ethers, upgrades, network } from "hardhat";
import { confirmContinue, assertEnvironment, waitForInput, updateConfigFile } from "./utils";
import hre from "hardhat";

assertEnvironment();

// Function declarations
async function deployGatewayProxy(): Promise<any> {
  await confirmContinue({
    contract: "Gateway",
    network: network.name,
    chainId: network.config.chainId,
  });

  const factory = await ethers.getContractFactory("Gateway");
  const contract = await upgrades.deployProxy(factory);

  const tx = await contract.deployTransaction.wait();
  
  console.log("✅ Deployed Gateway: ", tx.transactionHash);

  if (network.config.chainId !== undefined) {
    await updateConfigFile(network.config.chainId, contract.address);
  }
  console.log(`Proxy Contract Address: ${contract.address}`);

  return tx;
}

async function deployGateway(): Promise<any> {
  await confirmContinue({
    contract: "Gateway",
    network: network.name,
    chainId: network.config.chainId,
  });

  const factory = await ethers.getContractFactory("Gateway");
  const contract = await factory.deploy();

  const tx = await contract.deployTransaction.wait();
  
  console.log("✅ Deployed Gateway: ", tx.transactionHash);

  // const implementationAddress = await contract.implementation();
  await hre.run("verify:verify", {
		address: contract.address,
	});

  if (network.config.chainId !== undefined) {
    await updateConfigFile(network.config.chainId, contract.address);
  }

  console.log(`Proxy Contract Address: ${contract.address}`);

  return tx;
}


async function main() {
  const response = await waitForInput("\nDo you want to deploy a new Gateway proxy? y/N\n");
  if (response !== "y") {
    await deployGateway();
  } else {
    await deployGatewayProxy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
