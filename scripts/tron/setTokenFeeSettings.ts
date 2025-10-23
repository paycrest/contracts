import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

import { NETWORKS } from "../config";
import { getTronContracts } from "../utils";

async function main() {
  // Get contract instances
  const { gatewayInstance } = await getTronContracts();
  const networkConfig = NETWORKS[12002];

  // Configure token fee settings for each supported token
  Object.entries(networkConfig.supportedTokens).forEach(
    async ([tokenName, tokenConfig], index) => {
      try {
        const tx = await gatewayInstance
          .setTokenFeeSettings(
            tokenConfig.address,
            BigNumber.from(tokenConfig.local.senderToProvider),
            BigNumber.from(tokenConfig.local.providerToAggregator),
            BigNumber.from(tokenConfig.fx.senderToAggregator),
            BigNumber.from(tokenConfig.fx.providerToAggregator)
          )
          .send({
            feeLimit: 100_000_000,
            tokenValue: 0,
            shouldPollResponse: true,
          });
        
        console.log(`✅ Set fee settings for ${tokenName} (${tokenConfig.address}): ${tx}`);
        console.log(`   Local: senderToProvider=${tokenConfig.local.senderToProvider}, providerToAggregator=${tokenConfig.local.providerToAggregator}`);
        console.log(`   FX: senderToAggregator=${tokenConfig.fx.senderToAggregator}, providerToAggregator=${tokenConfig.fx.providerToAggregator}`);
      } catch (error) {
        console.error(`❌ Error setting fee settings for ${tokenName}:`, error);
      }
    }
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
