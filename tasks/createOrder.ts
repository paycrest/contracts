// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";
const chainId = 42161;
const network = NETWORKS[chainId];

async function createOrder() {
  // Get contract instances
  const { signer, paycrestInstance, DERC20Contract } = await getContracts();

  const { CREATE_ORDER_PARAMS } = network;

  // Define amount
  const amount = ethers.utils.parseUnits(
    CREATE_ORDER_PARAMS.CREATE_ORDER_AMOUNT,
    15 // IT IS KNOWN THE THE TOKEN DECIMAL IS 18
  );

  // Call contract method
  await paycrestInstance.createOrder(
    DERC20Contract.address,
    amount,
    ethers.utils.formatBytes32String(
      CREATE_ORDER_PARAMS.CREATE_ORDER_WITH_BANK_CODE
    ),
    CREATE_ORDER_PARAMS.CREATE_ORDER_RATE,
    signer.address,
    CREATE_ORDER_PARAMS.SENDER_FEE,
    signer.address,
    CREATE_ORDER_PARAMS.MESSAGE_HASH
  );
}

// Call the function
createOrder();