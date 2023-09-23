// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";
const chainId = 42161;
const MESSAGE_HASH = NETWORKS[chainId].MESSAGE_HASH;

async function createOrder() {
  // Get contract instances
  const { signer, paycrestInstance, DERC20Contract } = await getContracts();

  // Define amount
  const amount = ethers.utils.parseUnits("0.1", 15);

  // Call contract method
  await paycrestInstance.createOrder(
    DERC20Contract.address,
    amount,
    ethers.utils.formatBytes32String("FBNINGLA"),
    970,
    signer.address,
    0,
    signer.address,
    MESSAGE_HASH
  );
}

// Call the function
createOrder();