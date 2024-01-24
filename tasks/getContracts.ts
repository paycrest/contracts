import { ethers, network } from "hardhat";
import Paycrest from "../artifacts/contracts/Paycrest.sol/Paycrest.json";
import dotenv from "dotenv";
import { NETWORKS } from "../config";

dotenv.config();

const { DEPLOYER_PRIVATE_KEY } = process.env;

const networkConfig = NETWORKS[network.config.chainId!];

async function getContracts() {
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is undefined");
  }
  // Get signer
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.RPC_URL);
  const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

  // Get contract instances
  const paycrestInstance = new ethers.Contract(
    networkConfig.PAYCREST_CONTRACT,
    Paycrest.abi,
    provider
  );

  return {
    wallet,
    paycrestInstance,
  };
}

export { getContracts };
