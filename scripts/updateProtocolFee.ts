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

  const treasuryFeePercent = BigNumber.from(networkConfig.TREASURY_FEE_PERCENT);

  const provider = new ethers.providers.JsonRpcProvider(networkConfig.RPC_URL);
  
    const maxPriorityFeePerGas = network.config.chainId === 137 
      ? ethers.utils.parseUnits("90", "gwei") // Fallback to 30 Gwei
      : await provider.getGasPrice()
  
    const maxFeePerGas = network.config.chainId === 137 
      ? ethers.utils.parseUnits("120", "gwei")
      : await provider.getGasPrice()

  // call contract methods
  const tx = await contractWithSigner.updateProtocolFee(treasuryFeePercent,
    {
      maxPriorityFeePerGas,
      maxFeePerGas,
    }
  );

  await tx.wait();
  console.log(`✅ Update protocol fee: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
