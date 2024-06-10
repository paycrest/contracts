import { ethers } from "ethers";
import { assertTronEnvironment, getTronContracts } from "../utils";
import dotenv from "dotenv";

dotenv.config();

assertTronEnvironment();

async function main() {
  // Get contract instances
  const { gatewayInstance } = await getTronContracts();
  const treasury = ethers.utils.formatBytes32String("treasury");
  const aggregator = ethers.utils.formatBytes32String("aggregator");

  // Call contract methods
  let hash = await gatewayInstance
    .updateProtocolAddress(treasury, process.env.TREASURY_ADDRESS_TRON)
    .send({
        feeLimit: 100_000_000,
        tokenValue: 0,
    });
  console.log(`✅ Update treasury address: ${hash}`);

  hash = await gatewayInstance
    .updateProtocolAddress(aggregator, process.env.AGGREGATOR_ADDRESS_TRON)
    .send({
        feeLimit: 100_000_000,
        tokenValue: 0,
    });
  console.log(`✅ Update aggregator address: ${hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
