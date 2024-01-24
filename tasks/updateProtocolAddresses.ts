// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import dotenv from "dotenv";

dotenv.config();

async function updateProtocolAddresses() {
  // Get contract instances
  const { paycrestInstance } = await getContracts();

  const { TREASURY_ADDRESS } = process.env;

  const treasury = ethers.utils.formatBytes32String("treasury");

  // Call contract methods
  await paycrestInstance.updateProtocolAddresses(treasury, TREASURY_ADDRESS);
}

// Call the function
updateProtocolAddresses();
