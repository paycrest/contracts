import readline from "readline";
import dotenv from "dotenv";
import { artifacts, ethers, network } from "hardhat";
import { NETWORKS } from "./config";
const TronWeb = require("tronweb");
dotenv.config();

/**
 * Asserts that environment variables are set as expected
 */
export const assertEnvironment = () => {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Please set your DEPLOYER_PRIVATE_KEY in a .env file");
  }
  if (!process.env.TREASURY_ADDRESS) {
    console.error("Please set your TREASURY_ADDRESS in a .env file");
  }
};

/**
 * Asserts that environment variables are set as expected for Tron Network
 */
export const assertTronEnvironment = () => {
  if (!process.env.TRON_PRO_API_KEY) {
    console.error("Please set your TRON_PRO_API_KEY in a .env file");
  }
  if (!process.env.PRIVATE_KEY_SHASTA) {
    console.error("Please set your PRIVATE_KEY_SHASTA in a .env file");
  }
};

/**
 * Helper method for waiting on user input. Source: https://stackoverflow.com/a/50890409
 * @param query
 */
export async function waitForInput(query: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
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

  const networkConfig =
    NETWORKS[network.config.chainId as keyof typeof NETWORKS];
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

  const shastaConfig = NETWORKS[12002];
  const tronWeb = new TronWeb({
    fullHost: shastaConfig.RPC_URL, // I am not sure tron has an other way to get it chainID, at least to the best of my search
    headers: { "TRON-PRO-API-KEY": process.env.TRON_PRO_API_KEY },
    privateKey: process.env.PRIVATE_KEY_SHASTA,
  });

  let gatewayInstance = await tronWeb.contract(
    Gateway.abi,
    shastaConfig.GATEWAY_CONTRACT
  );

  return {
    gatewayInstance,
  };
}
