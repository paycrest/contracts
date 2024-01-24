// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "../config";

const chainID = 80001;

const network = NETWORKS[chainID];

async function addSupportedTokens() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();

  const token = ethers.utils.formatBytes32String("token");

  // Call contract methods
  Object.values(network.SUPPORTED_TOKENS).forEach(async value => {
    await paycrestInstance.settingManagerBool(token, value, true);
  });
}

// Call the function
addSupportedTokens();
