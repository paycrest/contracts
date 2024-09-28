import { ethers, upgrades, network } from "hardhat";
import { confirmContinue, assertEnvironment } from "./utils";
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

  // const implementationAddress = await contract.implementation();

  console.log(`Proxy Contract Address: ${contract.address}`);
  // console.log("Implementation Contract Address:", implementationAddress);

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
