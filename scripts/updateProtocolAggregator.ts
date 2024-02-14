import { getContracts } from "./utils";

async function main() {
  // Get contract instances
  const { paycrestInstance, wallet } = await getContracts();
  const contractWithSigner = paycrestInstance.connect(wallet);

  // call contract methods
  const tx = await contractWithSigner.updateProtocolAggregator(process.env.AGGREGATOR_PUBLIC_KEY);

  await tx.wait();
  console.log(`✅ Update Protocol Aggregator: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
