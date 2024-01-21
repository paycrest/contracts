// Import ethers and contracts
import { ethers } from "ethers";
import { getContracts } from "./getContracts";
import { NETWORKS } from "../config";

const chainID = 42161;

const network = NETWORKS[chainID];

async function setMinimumAmountForTokens() {
  // Get contract instances
  const { paycrestValidatorInstance } = await getContracts();
  const { SET_MINIMUM_AMOUNT, USDC_ADDRESS, USDT_ADDRESS, DERC20_TOKEN } = network;

  // call contract methods
  await paycrestValidatorInstance.setMinimumAmountForTokens(
    DERC20_TOKEN,
    SET_MINIMUM_AMOUNT.DERC20
  );
  await paycrestValidatorInstance.setMinimumAmountForTokens(
    USDC_ADDRESS,
    SET_MINIMUM_AMOUNT.USDC
  );
  await paycrestValidatorInstance.setMinimumAmountForTokens(
    USDT_ADDRESS,
    SET_MINIMUM_AMOUNT.USDT
  );
}

// Call the function
setMinimumAmountForTokens();
