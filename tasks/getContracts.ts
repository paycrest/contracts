// import { ethers } from "hardhat";
import { ethers } from "ethers";
import Paycrest from "../artifacts/contracts/Paycrest.sol/Paycrest.json";
import PaycrestValidator from "../artifacts/contracts/PaycrestValidator.sol/PaycrestValidator.json";
import MockUSDC from "../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json";
import dotenv from "dotenv";
import { NETWORKS } from "./config";

dotenv.config();

const { DEPLOYER_PRIVATE_KEY, POLYGON_MUMBAI_RPC_URL } = process.env;
const chainID = 42161;

const network = NETWORKS[chainID];

async function getContracts() {
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is undefined");
  }
  // Get signer
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY);
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_MUMBAI_RPC_URL);
  const signer = deployer.connect(provider);

  // Get contract instances
  const paycrestInstance = new ethers.Contract(
    network.PAYCREST_CONTRACT,
    Paycrest.abi,
    provider
  );
  const paycrestValidatorInstance = new ethers.Contract(
    network.PAYCREST_VALIDATOR_CONTRACT,
    PaycrestValidator.abi,
    provider
  );
  const DERC20Contract = new ethers.Contract(
    network.DERC20_TOKEN,
    MockUSDC.abi,
    provider
  );

  return {
    signer,
    paycrestInstance,
    paycrestValidatorInstance,
    DERC20Contract,
  };
}

export { getContracts };
