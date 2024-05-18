import { BigNumber } from "@ethersproject/bignumber";
import { getTronContracts } from "../utils";
import { NETWORKS } from "../config";
import { ethers } from "ethers";

async function main() {
  const { gatewayInstance } = await getTronContracts();
  const networkConfig = NETWORKS[12002];
  
  const token = ethers.utils.formatBytes32String("token");

  Object.entries(networkConfig.SUPPORTED_TOKENS).forEach(async ([key, value], index) => {
    const hash = await gatewayInstance
      .settingManagerBool(token, value, BigNumber.from(1))
      .send({
        feeLimit: 100_000_000,
        tokenValue: 0,
      });
    console.log(`✅ Set token ${key}: ${hash}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
