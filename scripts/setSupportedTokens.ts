import { BigNumber } from "@ethersproject/bignumber";
import { network } from "hardhat";
import { ethers } from "ethers";
import { NETWORKS } from "./config";
import { getContracts } from "./utils";

const chainId = (network as unknown as { config: { chainId: number } }).config.chainId;
const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const token = ethers.encodeBytes32String("token");

  // Get the current nonce
  const currentNonce = await wallet.getTransactionCount();
  // get provider
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

  let maxPriorityFeePerGas: bigint;
  let maxFeePerGas: bigint;
  if (chainId === 42220) {
    // Celo: fall back to fixed 90/120 Gwei tips.
    maxPriorityFeePerGas = ethers.parseUnits("90", "gwei");
    maxFeePerGas = ethers.parseUnits("120", "gwei");
  } else {
    const { gasPrice } = await provider.getFeeData();
    if (gasPrice === null) {
      throw new Error(`Unable to fetch gas price for chain ${chainId}`);
    }
    maxPriorityFeePerGas = gasPrice;
    maxFeePerGas = gasPrice;
  }

  // Call contract methods
  Object.entries(networkConfig.supportedTokens).forEach(async ([key, token], index) => {
    const tx = await contractWithSigner.settingManagerBool(token, token.address, BigNumber.from(1), {
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
