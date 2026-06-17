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

  const maxPriorityFeePerGas = chainId === 42220 
    ? ethers.parseUnits("90", "gwei")
    : (await provider.getFeeData()).gasPrice

  const maxFeePerGas = chainId === 42220 
    ? ethers.parseUnits("120", "gwei")
    : (await provider.getFeeData()).gasPrice

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
