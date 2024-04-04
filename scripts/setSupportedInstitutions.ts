import { ethers } from "ethers";
import { CURRENCIES, INSTITUTIONS } from "./config";
import { getContracts } from "./utils";

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  // Get the current nonce
  const currentNonce = await wallet.getTransactionCount();

  // Call contract methods
  Object.entries(INSTITUTIONS).forEach(async ([key, value], index) => {
    const tx = await contractWithSigner.setSupportedInstitutions(
      CURRENCIES.find(currency => currency.code === ethers.utils.formatBytes32String(key))!.code,
      INSTITUTIONS[key as keyof typeof INSTITUTIONS], {
        nonce: currentNonce + index,
      }
    );
    await tx.wait();
    console.log(`✅ Set institutions for ${key}: ${tx.hash}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
