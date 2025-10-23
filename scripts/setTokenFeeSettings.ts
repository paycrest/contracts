import { network } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const provider = new ethers.providers.JsonRpcProvider(networkConfig.rpcUrl);
  
  const maxPriorityFeePerGas = network.config.chainId === 137 
    ? ethers.utils.parseUnits("90", "gwei") // Fallback to 30 Gwei
    : await provider.getGasPrice()
  
  const maxFeePerGas = network.config.chainId === 137 
    ? ethers.utils.parseUnits("120", "gwei")
    : await provider.getGasPrice()

  // Get the current nonce
  const currentNonce = await wallet.getTransactionCount();

  // Configure token fee settings for each supported token
  Object.entries(networkConfig.supportedTokens).forEach(async ([tokenName, tokenConfig], index) => {
    try {
      const tx = await contractWithSigner.setTokenFeeSettings(
        tokenConfig.address,
        BigNumber.from(tokenConfig.local.senderToProvider),
        BigNumber.from(tokenConfig.local.providerToAggregator),
        BigNumber.from(tokenConfig.fx.senderToAggregator),
        BigNumber.from(tokenConfig.fx.providerToAggregator),
        {
          nonce: currentNonce + index,
          maxPriorityFeePerGas,
          maxFeePerGas,
        }
      );

      await tx.wait();
      console.log(`✅ Set fee settings for ${tokenName} (${tokenConfig.address}): ${tx.hash}`);
      console.log(`   Local: senderToProvider=${tokenConfig.local.senderToProvider}, providerToAggregator=${tokenConfig.local.providerToAggregator}`);
      console.log(`   FX: senderToAggregator=${tokenConfig.fx.senderToAggregator}, providerToAggregator=${tokenConfig.fx.providerToAggregator}`);
    } catch (error) {
      console.error(`❌ Error setting fee settings for ${tokenName}:`, error);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
