// Import ethers and contracts
import { ethers } from "ethers";
import * as crypto from "crypto";
require("dotenv").config();
const fs = require("fs");
const path = require("path");

import { getContracts } from "./getContracts";
import { NETWORKS } from "./config";
const chainId = 42161;
const network = NETWORKS[chainId];
let privateKey: any;
let publicKey: any;

async function createOrder() {
  // Get contract instances
  const { signer, paycrestInstance, DERC20Contract } = await getContracts();

  const { CREATE_ORDER_PARAMS, PUBLIC_KEY } = network;

  try {
    const PrivateKey = path.join(__dirname, "../privateKey.txt");
    const PublicKey = path.join(__dirname, "../publicKey.txt");

    privateKey = fs.readFileSync(PrivateKey);
    publicKey = fs.readFileSync(PublicKey);
    // console.log("privateKey: ", privateKey.toString());
  } catch (err) {
    console.error("Error reading file:", err);
  }

  // Define amount
  const amount = ethers.utils.parseUnits(
    CREATE_ORDER_PARAMS.CREATE_ORDER_AMOUNT,
    15 // IT IS KNOWN THE THE TOKEN DECIMAL IS 18
  );

  // Create a JSON object to be signed
  const message = {
    BankName: "Opay",
    AccountNumber: 7878787878787878,
    BankCode: "NGNOpay",
  };
  const messageString = JSON.stringify(message);

  const sign = crypto.createSign("SHA256");
  sign.update(messageString);
  const signature = sign.sign(privateKey.toString(), "base64");
  const verify = crypto.createVerify("SHA256");
  verify.update(messageString);
  const isVerified = verify.verify(publicKey.toString(), signature, "base64");

  console.log("isVerified: ", isVerified);

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
    signature
  );
}

// Call the function
createOrder();
