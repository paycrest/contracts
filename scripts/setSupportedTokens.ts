import { BigNumber } from "@ethersproject/bignumber";
import { ethers, network } from "hardhat";
import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const token = ethers.utils.formatBytes32String("token");

  // Get the current nonce
  const currentNonce = await wallet.getTransactionCount();
  // get provider
  const provider = new ethers.providers.JsonRpcProvider(networkConfig.RPC_URL);

  const maxPriorityFeePerGas = network.config.chainId === 42220 
    ? ethers.utils.parseUnits("90", "gwei") // Fallback to 30 Gwei
    : await provider.getGasPrice()

  const maxFeePerGas = network.config.chainId === 42220 
    ? ethers.utils.parseUnits("120", "gwei")
    : await provider.getGasPrice()

  // Call contract methods
  Object.entries(networkConfig.SUPPORTED_TOKENS).forEach(async ([key, value], index) => {
    const tx = await contractWithSigner.settingManagerBool(token, value, BigNumber.from(1), {
      nonce: currentNonce + index,
      maxPriorityFeePerGas,
      maxFeePerGas,
    });
    await tx.wait();
    console.log(`✅ Set token ${key}: ${tx.hash}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
