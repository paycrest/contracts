import { ethers } from "ethers";
import { assertEnvironment, getContracts } from "./utils";
import dotenv from "dotenv";

dotenv.config();

assertEnvironment();

async function main() {
  // Get contract instances
  const { gatewayInstance, wallet } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  const treasury = ethers.utils.formatBytes32String("treasury");
  const aggregator = ethers.utils.formatBytes32String("aggregator");

  // Call contract methods
  let tx = await contractWithSigner.updateProtocolAddress(
		treasury,
		process.env.TREASURY_ADDRESS,
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
