// Import ethers and contracts
import { ethers } from "ethers";
import * as crypto from "crypto";
require("dotenv").config();
const fs = require("fs");
const path = require("path");

import { getContracts } from "./getContracts";
import { NETWORKS } from "../config";
const chainId = 42161;
const network = NETWORKS[chainId];
let privateKey: any;
let publicKey: any;

async function createOrder() {
  // Get contract instances
  const { signer, paycrestInstance, DERC20Contract } = await getContracts();

  const { CREATE_ORDER_PARAMS } = network;
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) throw new Error("MNEMONIC not found in .env file");
  // using ethers generate address from mnemonic
  const wallet = ethers.Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/2");
  console.log("wallet: ", wallet.address);
  // generate private key and public key from mnemonic
  // create more wallets NOT RANDOMLY
  const walletPrivateKey = wallet.privateKey;
  const walletPublicKey = wallet.publicKey;
  console.log("walletPrivateKey: ", walletPrivateKey);
  console.log("walletPublicKey: ", walletPublicKey);

  // // Connect to provider
  const provider = ethers.providers.getDefaultProvider();
  const walletSigner = wallet.connect(provider);

  // // Sign message
  const message = "Hello World";
  // sign message with public key and verify with private key
  
  // const publicKey = "0x...";
  // // FROM wallet3PrivateKey get the address
  const walletO = new ethers.Wallet(walletPublicKey);

  // // Address from public key
  const expectedAddress = walletO.address;

  // Recover address
  // const recoveredAddress = ethers.utils.recoverAddress(
  //   ethers.utils.hashMessage(message),
  //   signedMessage
  // );
  // console.log("recoveredAddress: ", recoveredAddress);

  // // Check match
  // if (recoveredAddress === expectedAddress) {
  //   console.log("Signature is valid!");
  // } else {
  //   console.log("Invalid signature");
  // }

  // try {
  //   const PrivateKey = path.join(__dirname, "../privateKey.txt");
  //   const PublicKey = path.join(__dirname, "../publicKey.txt");

  //   privateKey = fs.readFileSync(PrivateKey);
  //   publicKey = fs.readFileSync(PublicKey);
  //   // console.log("privateKey: ", privateKey.toString());
  // } catch (err) {
  //   console.error("Error reading file:", err);
  // }

  // // Define amount
  // const amount = ethers.utils.parseUnits(
  //   CREATE_ORDER_PARAMS.CREATE_ORDER_AMOUNT,
  //   15 // IT IS KNOWN THE THE TOKEN DECIMAL IS 18
  // );

  // // Create a JSON object to be signed
  // const message = {
  //   BankName: "Opay",
  //   AccountNumber: 7878787878787878,
  //   BankCode: "NGNOpay",
  // };
  // const messageString = JSON.stringify(message);

  // const sign = crypto.createSign("SHA256");
  // sign.update(messageString);
  // const signature = sign.sign(privateKey.toString(), "base64");
  // const verify = crypto.createVerify("SHA256");
  // verify.update(messageString);
  // const isVerified = verify.verify(publicKey.toString(), signature, "base64");

  // console.log("isVerified: ", isVerified);

  // // Call contract method
  // await paycrestInstance.createOrder(
  //   DERC20Contract.address,
  //   amount,
  //   ethers.utils.formatBytes32String(
  //     CREATE_ORDER_PARAMS.CREATE_ORDER_WITH_BANK_CODE
  //   ),
  //   CREATE_ORDER_PARAMS.CREATE_ORDER_RATE,
  //   signer.address,
  //   CREATE_ORDER_PARAMS.SENDER_FEE,
  //   signer.address,
  //   signature
  // );
}

// Call the function
createOrder();
