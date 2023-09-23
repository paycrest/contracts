// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function addSupportedInstitutions() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();
//   console.log(`Adding supported institutions for ${chainID}`);
//   console.log(network.BANKS);

    await paycrestInstance.setSupportedInstitutions(network.CURRENCIES[0], network.BANKS);
}

// Call the function
addSupportedInstitutions();
