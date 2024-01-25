import { ethers, network } from "hardhat";
import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();
  const contractWithSigner = paycrestInstance.connect(wallet);

  const token = ethers.utils.formatBytes32String("token");

  // Get the current nonce
  const currentNonce = await wallet.getTransactionCount();

  // Call contract methods
  Object.entries(networkConfig.SUPPORTED_TOKENS).forEach(async ([key, value], index) => {
    const tx = await contractWithSigner.settingManagerBool(token, value, true, {
      nonce: currentNonce + index,
    });
    await tx.wait();
    console.log(`✅ Set token ${key}: ${tx.hash}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
