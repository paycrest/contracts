const { ethers, upgrades } = require("hardhat");
// import contracts abi from artifacts
const Paycrest = require("../../artifacts/contracts/Paycrest.sol/Paycrest.json");
const PaycrestValidator = require("../../artifacts/contracts/PaycrestValidator.sol/PaycrestValidator.json");
const MockUSDC = require("../../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json");
// import dotenv
require("dotenv").config();
// import DEPLOYER_PRIVATE_KEY from .env
const { DEPLOYER_PRIVATE_KEY, POLYGON_MUMBAI_RPC_URL } = process.env;
// import config.js
const { NETWORKS } = require("../config.js");
const chainID = 42161;

let network = NETWORKS[chainID];

async function getContracts() {
  // get signer
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY);
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_MUMBAI_RPC_URL);
  const signer = deployer.connect(provider);

  // get contract instances
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
  const DERC20_Contract_Instance = new ethers.Contract(
    network.DERC20_TOKEN,
    MockUSDC.abi,
    provider
  );

  return {
    signer,
    paycrestInstance,
    paycrestValidatorInstance,
    DERC20_Contract_Instance,
  };
}
module.exports = { getContracts };
