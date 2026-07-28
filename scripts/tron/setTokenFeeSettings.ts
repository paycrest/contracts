import { BigNumber } from "@ethersproject/bignumber";

import { NETWORKS } from "../config";
import { getTronContracts } from "../utils";

async function main() {
  // Get contract instances
  const { gatewayInstance } = await getTronContracts();
  const networkConfig = NETWORKS[12002];

  // Configure token fee settings for each supported token sequentially
  for (const [tokenName, tokenConfig] of Object.entries(networkConfig.supportedTokens)) {
    try {
      const tx = await gatewayInstance
        .setTokenFeeSettings(
          tokenConfig.address,
          BigNumber.from(tokenConfig.senderToTreasury),
          BigNumber.from(tokenConfig.providerToTreasury)
        )
        .send({
          feeLimit: 100_000_000,
          tokenValue: 0,
          shouldPollResponse: true,
        });
      
      console.log(`✅ Set fee settings for ${tokenName} (${tokenConfig.address}): ${tx}`);
      console.log(`   Treasury: senderToTreasury=${tokenConfig.senderToTreasury}, providerToTreasury=${tokenConfig.providerToTreasury}`);
    } catch (error) {
      console.error(`❌ Error setting fee settings for ${tokenName}:`, error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
