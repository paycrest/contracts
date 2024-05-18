import { ethers } from "ethers";
import { CURRENCIES, INSTITUTIONS } from "../config";
import { getTronContracts } from "../utils";

async function main() {
  // Get contract instances
  const { gatewayInstance } = await getTronContracts();

  // Call contract methods
  Object.entries(INSTITUTIONS).forEach(async ([key, value], index) => {
    console.log(CURRENCIES.find(currency => currency.code === ethers.utils.formatBytes32String(key))!.code)
    console.log(INSTITUTIONS[key as keyof typeof INSTITUTIONS])
    const hash = await gatewayInstance.setSupportedInstitutions(
      CURRENCIES.find(currency => currency.code === ethers.utils.formatBytes32String(key))!.code,
      INSTITUTIONS[key as keyof typeof INSTITUTIONS],
    ).send({
      feeLimit: 100_000_000,
      tokenValue: 0,
    });
    console.log(`✅ Set institutions for ${key}: ${hash}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
