// Import ethers and contracts
import { getContracts } from "./getContracts";
import { CURRENCIES, INSTITUTIONS } from "../config";

async function addSupportedInstitutions() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();

  Object.entries(INSTITUTIONS).forEach(async ([key, value]) => {
    await paycrestInstance.setSupportedInstitutions(
      CURRENCIES.find(currency => currency.code === key),
      INSTITUTIONS[key as keyof typeof INSTITUTIONS],
    );
  });
}

// Call the function
addSupportedInstitutions();
