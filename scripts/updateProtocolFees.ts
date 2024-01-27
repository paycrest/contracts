import { network } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";

import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();
  const contractWithSigner = paycrestInstance.connect(wallet);

  const treasuryFeePercent = BigNumber.from(networkConfig.TREASURY_FEE_PERCENT);

  // call contract methods
  const tx = await contractWithSigner.updateProtocolFees(treasuryFeePercent);

  await tx.wait();
  console.log(`✅ Update Protocol fees: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
