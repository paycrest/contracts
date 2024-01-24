// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { CURRENCIES, INSTITUTIONS } from "../config";

async function addSupportedInstitutions() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();

  const contractWithSigner = paycrestInstance.connect(wallet);

  // Call contract methods
  Object.entries(INSTITUTIONS).forEach(async ([key, value]) => {
    const tx = await contractWithSigner.setSupportedInstitutions(
      CURRENCIES.find(currency => currency.code === ethers.utils.formatBytes32String(key))!.code,
      INSTITUTIONS[key as keyof typeof INSTITUTIONS],
    );
    console.log(`✅ Set institutions for ${key}: ${tx.hash}`);
    await tx.wait();
  });
}

// Call the function
addSupportedInstitutions();
