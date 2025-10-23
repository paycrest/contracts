import { BigNumber } from "@ethersproject/bignumber";
import { getTronContracts } from "../utils";
import { NETWORKS } from "../config";
import { ethers } from "ethers";

async function main() {
  const { gatewayInstance } = await getTronContracts();
  const networkConfig = NETWORKS[12002];

  // let result = await gatewayInstance["getFeeDetails"]().call();
  // console.log(result[0].toString(), result[1].toString());
  const token = ethers.utils.formatBytes32String("token");

  Object.entries(networkConfig.supportedTokens).forEach(
    async ([key, token], index) => {
      try {
        const tx = await gatewayInstance
          .settingManagerBool(token, token.address, BigNumber.from(1))
          .send({
            feeLimit: 100_000_000,
            tokenValue: 0,
            shouldPollResponse: true,
          });
        console.log(`✅ Set token ${key}: ${tx}`);
      } catch(e) {
        console.log(`❌ Error setting token: ${e}}`)
      }
    }
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
