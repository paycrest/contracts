// Import ethers and contracts
import { getContracts } from "./getContracts";
import { NETWORKS } from "../config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function initializedValidatorsContractState() {
  // Get contract instances
  const { paycrestValidatorInstance } = await getContracts();
  const { VALIDATORS_STATUS } = network;

  // call contract methods
  await paycrestValidatorInstance.initialized(VALIDATORS_STATUS);
}

// Call the function
initializedValidatorsContractState();
