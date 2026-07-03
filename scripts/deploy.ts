import hre from "hardhat";
import { confirmContinue, assertEnvironment, waitForInput, updateConfigFile } from "./utils";

assertEnvironment();

const hardhat = hre as unknown as {
  ethers: {
    getContractFactory: (name: string) => Promise<any>;
  };
  upgrades: {
    deployProxy: (factory: any) => Promise<any>;
  };
  network: {
    name?: string;
    config: {
      chainId?: number;
    };
  };
  run: (taskName: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const { ethers, upgrades, network } = hardhat;
const chainId = network.config.chainId;
const networkName = network.name ?? process.env.HARDHAT_NETWORK ?? "hardhat";

async function waitForDeployment(contract: any) {
  await contract.waitForDeployment?.();
  const tx = contract.deploymentTransaction?.();
  const address = typeof contract.getAddress === "function" ? await contract.getAddress() : contract.address;

  return {
    address,
    txHash: tx?.hash,
  };
}

// Function declarations
async function deployGatewayProxy(): Promise<any> {
  await confirmContinue({
    contract: "Gateway",
    network: networkName,
    chainId,
  });

  const factory = await ethers.getContractFactory("Gateway");
  const contract = await upgrades.deployProxy(factory);
  const deployment = await waitForDeployment(contract);

  console.log("✅ Deployed Gateway: ", deployment.txHash ?? deployment.address);

  if (chainId !== undefined) {
    await updateConfigFile(chainId, deployment.address);
  }
  console.log(`Proxy Contract Address: ${deployment.address}`);

  return contract;
}

async function deployGateway(): Promise<any> {
  await confirmContinue({
    contract: "Gateway",
    network: networkName,
    chainId,
  });

  const factory = await ethers.getContractFactory("Gateway");
  const contract = await factory.deploy();
  const deployment = await waitForDeployment(contract);

  console.log("✅ Deployed Gateway: ", deployment.txHash ?? deployment.address);

  // const implementationAddress = await contract.implementation();
  await hardhat.run("verify:verify", {
		address: deployment.address,
	});

  if (chainId !== undefined) {
    await updateConfigFile(chainId, deployment.address);
  }

  console.log(`Proxy Contract Address: ${deployment.address}`);

  return contract;
}


async function main() {
  const response = await waitForInput("\nDo you want to deploy a new Gateway proxy? y\n");
  const responseStr = response as string; // Cast response to string
  if (responseStr.toLowerCase() !== "y") {
    await deployGateway();
  } else {
    await deployGatewayProxy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
