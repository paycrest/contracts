// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "../config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function updateProtocolFees() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();
  const { TREASURY_FEE_PERCENT } = network;

  // call contract methods
  await paycrestInstance.updateProtocolFees(TREASURY_FEE_PERCENT);
}

// Call the function
updateProtocolFees();
