import { network } from "hardhat";
import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();
  const contractWithSigner = paycrestInstance.connect(wallet);

  // call contract methods
  await contractWithSigner.updateProtocolFees(networkConfig.TREASURY_FEE_PERCENT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
