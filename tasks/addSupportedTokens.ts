// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function addSupportedTokens() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();
  const {DERC20_TOKEN, USDC_ADDRESS, USDT_ADDRESS} = network;

  const token = ethers.utils.formatBytes32String("token");
  const whitelist = ethers.utils.formatBytes32String("whitelist");

  // call contract methods
  await paycrestInstance.settingManagerBool(token, DERC20_TOKEN, true);
  await paycrestInstance.settingManagerBool(whitelist, DERC20_TOKEN, true);

  
}

// Call the function
addSupportedTokens();
