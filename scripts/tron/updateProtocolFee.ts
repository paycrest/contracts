import { BigNumber } from "@ethersproject/bignumber";

import { NETWORKS } from "../config";
import { getTronContracts } from "../utils";

async function main() {
  // Get contract instances
  const { gatewayInstance } = await getTronContracts();

  const treasuryFeePercent = BigNumber.from(NETWORKS[12002].TREASURY_FEE_PERCENT);

  // call contract methods
  const hash = await gatewayInstance
    .updateProtocolFee(treasuryFeePercent)
    .send({
        feeLimit: 100_000_000,
        tokenValue: 0,
    });

  console.log(`✅ Update protocol fee: ${hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
