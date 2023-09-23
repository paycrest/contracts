// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import dotenv from "dotenv";

dotenv.config();

async function createOrder() {
  // Get contract instances
  const {paycrestInstance } = await getContracts();

  const {FEE_COLLECTOR_ADDRESS, AGGREGATOR_ADDRESS} = process.env;

  const fee = ethers.utils.formatBytes32String("fee");
  const aggregatorInit = ethers.utils.formatBytes32String("aggregator");
  // call contract methods
  await paycrestInstance.updateFeeRecipient(fee, FEE_COLLECTOR_ADDRESS);
  await paycrestInstance.updateFeeRecipient(aggregatorInit, AGGREGATOR_ADDRESS);
}

// Call the function
createOrder();
