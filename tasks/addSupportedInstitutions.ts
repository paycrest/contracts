// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function addSupportedInstitutions() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();
  const CURRENCIES = [
      {
        code: ethers.utils.formatBytes32String("NGN"),
        name: ethers.utils.formatBytes32String("Nigerian Naira"),
      },
      // Add other currencies here
    ];
    const BANKS = [
      {
        code: ethers.utils.formatBytes32String("FBNINGLA"),
        name: ethers.utils.formatBytes32String("First Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("OPAYNINGLA"),
        name: ethers.utils.formatBytes32String("Opay"),
      },
      {
        code: ethers.utils.formatBytes32String("PPBNINGLA"),
        name: ethers.utils.formatBytes32String("Palmpay Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("ACBNINGLA"),
        name: ethers.utils.formatBytes32String("Access Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("GTBNINGLA"),
        name: ethers.utils.formatBytes32String("GTB"),
      },
      {
        code: ethers.utils.formatBytes32String("IBTCNINGLA"),
        name: ethers.utils.formatBytes32String("Stanbic IBTC Bank"),
      },
      // Add other banks here
    ];
    console.log(CURRENCIES);

    await paycrestInstance.setSupportedInstitutions(CURRENCIES[0], BANKS);
}

// Call the function
addSupportedInstitutions();
