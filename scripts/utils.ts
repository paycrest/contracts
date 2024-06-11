import readline from "readline";
import dotenv from "dotenv";
import { artifacts, ethers, network } from "hardhat";
import { NETWORKS } from "./config";
const TronWeb = require("tronweb");

dotenv.config();

const shastaConfig = NETWORKS[12002];
const tronWeb = new TronWeb({
	fullHost: shastaConfig.RPC_URL, // I am not sure tron has an other way to get it chainID, at least to the best of my search
	headers: { "TRON-PRO-API-KEY": process.env.TRON_PRO_API_KEY },
	privateKey: process.env.DEPLOYER_PRIVATE_KEY_TRON,
});

/**
 * Asserts that environment variables are set as expected
 */
export const assertEnvironment = () => {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Please set DEPLOYER_PRIVATE_KEY in a .env file");
    process.exit(1); // Kill the process if DEPLOYER_PRIVATE_KEY is not set
  }
  if (!process.env.TREASURY_ADDRESS) {
    console.error("Please set TREASURY_ADDRESS in a .env file");
    process.exit(1); // Kill the process if TREASURY_ADDRESS is not set
  }
  if (!process.env.AGGREGATOR_ADDRESS) {
    console.error("Please set AGGREGATOR_ADDRESS in a .env file");
    process.exit(1); // Kill the process if AGGREGATOR_ADDRESS is not set
  }
};

/**
 * Asserts that environment variables are set as expected for Tron Network
 */
export const assertTronEnvironment = () => {
  if (!process.env.TRON_PRO_API_KEY) {
    console.error("Please set TRON_PRO_API_KEY in a .env file");
    process.exit(1); // Kill the process if TRON_PRO_API_KEY is not set
  }
  if (!process.env.DEPLOYER_PRIVATE_KEY_TRON) {
    console.error("Please set DEPLOYER_PRIVATE_KEY_TRON in a .env file");
    process.exit(1); // Kill the process if DEPLOYER_PRIVATE_KEY_TRON is not set
  }
  if (!process.env.TREASURY_ADDRESS_TRON) {
    console.error("Please set TREASURY_ADDRESS_TRON in a .env file");
    process.exit(1); // Kill the process if TREASURY_ADDRESS_TRON is not set
  }
  if (!process.env.AGGREGATOR_ADDRESS_TRON) {
    console.error("Please set AGGREGATOR_ADDRESS_TRON in a .env file");
    process.exit(1); // Kill the process if AGGREGATOR_ADDRESS_TRON is not set
  }
};

/**
 * Helper method for waiting on user input. Source: https://stackoverflow.com/a/50890409
 * @param query
 */
export async function waitForInput(query: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Helper method for confirming user input
 *
 * @param params
 */
export async function confirmContinue(params: any) {
  console.log("\nPARAMETERS");
  console.table(params);

  const response = await waitForInput("\nDo you want to continue? y/N\n");
  if (response !== "y")
    throw new Error("Aborting script: User chose to exit script");
  console.log("\n");
}


/**
 * Retrieves the wallet and contract instances.
 * 
 * @returns An object containing the wallet and contract instances.
 */
export async function getContracts(): Promise<any> {
  assertEnvironment();

  const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];
  const Gateway = await artifacts.readArtifact("Gateway");
  
  // Get signer
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  // Get contract instances
  const gatewayInstance = new ethers.Contract(
    networkConfig.GATEWAY_CONTRACT,
    Gateway.abi,
    provider
  );

  return {
		wallet,
		gatewayInstance,
		tronWeb,
	};
}

/**
 * Retrieves the contract instances for TRON Network.
 * 
 * @returns An object containing the contract instances.
 */
export async function getTronContracts(): Promise<any> {
  assertTronEnvironment();
  const Gateway = await artifacts.readArtifact("Gateway");
  
  const gatewayContractAddress = shastaConfig.GATEWAY_CONTRACT;
  let gatewayInstance = await tronWeb.contract(
    Gateway.abi,
		gatewayContractAddress
    );
  return {
		gatewayInstance,
		gatewayContractAddress,
	};
}