import { network } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const chainId = (network as unknown as { config: { chainId: number } }).config.chainId;
const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  
  // Polygon: fall back to fixed 90/120 Gwei tips.
  const maxPriorityFeePerGas =
    chainId === 137
      ? ethers.parseUnits("90", "gwei")
      : (await provider.getFeeData()).gasPrice;

  const maxFeePerGas =
    chainId === 137
      ? ethers.parseUnits("120", "gwei")
      : (await provider.getFeeData()).gasPrice;

  // Get the current nonce
  let nonce = await wallet.getTransactionCount();

  // Configure token fee settings for each supported token sequentially
  for (const [tokenName, tokenConfig] of Object.entries(networkConfig.supportedTokens)) {
    try {
      const tx = await contractWithSigner.setTokenFeeSettings(
        tokenConfig.address,
        BigNumber.from(tokenConfig.senderToTreasury),
        BigNumber.from(tokenConfig.providerToTreasury),
        {
          nonce: nonce++,
          maxPriorityFeePerGas,
          maxFeePerGas,
        }
      );

      await tx.wait();
      console.log(`✅ Set fee settings for ${tokenName} (${tokenConfig.address}): ${tx.hash}`);
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
