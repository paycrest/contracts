import { ethers } from "ethers";
import { assertEnvironment, getContracts } from "./utils";
import dotenv from "dotenv";
import { network } from "hardhat";

dotenv.config();

assertEnvironment();

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const treasury = ethers.utils.formatBytes32String("treasury");
  const aggregator = ethers.utils.formatBytes32String("aggregator");

  let treasuryAddress = process.env.TREASURY_ADDRESS;
  // let aggregatorAddress = process.env.AGGREGATOR_ADDRESS;

  if (network.config.chainId === 295) {
    treasuryAddress = process.env.TREASURY_ADDRESS_HEDERA;
    // aggregatorAddress = process.env.AGGREGATOR_ADDRESS_HEDERA;
  }

  // Call contract methods
  let tx = await contractWithSigner.updateProtocolAddress(
		treasury,
		treasuryAddress,
	);
  await tx.wait();
  console.log(`✅ Update treasury address: ${tx.hash}`);

  tx = await contractWithSigner.updateProtocolAddress(
		aggregator,
		process.env.AGGREGATOR_ADDRESS,
	);
  await tx.wait();
  console.log(`✅ Update aggregator address: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
