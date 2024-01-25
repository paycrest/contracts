import { ethers } from "ethers";
import { assertEnvironment, getContracts } from "./utils";
import dotenv from "dotenv";

dotenv.config();

assertEnvironment();

async function main() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();
  const contractWithSigner = paycrestInstance.connect(wallet);

  const treasury = ethers.utils.formatBytes32String("treasury");

  // Call contract methods
  const tx = await contractWithSigner.updateProtocolAddresses(treasury, process.env.TREASURY_ADDRESS);
  await tx.wait();
  console.log(`✅ Update Protocol addresses: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
