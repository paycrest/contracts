/**
 * Script to create an order on the Gateway contract
 * 
 * Usage:
 *   npx hardhat run scripts/createOrder.ts --network hederaTestnet
 * 
 * Environment Variables (all optional):
 *   TOKEN_ADDRESS - Token contract address (defaults to first supported token in config)
 *   AMOUNT - Amount to lock (default: "1000000" = 1 USDC with 6 decimals)
 *   RATE - Exchange rate (default: "1000000")
 *   SENDER_FEE_RECIPIENT - Address to receive sender fee (default: zero address)
 *   SENDER_FEE - Fee amount (default: "0")
 *   REFUND_ADDRESS - Address to receive refunds (default: wallet address)
 *   MESSAGE_HASH - Message hash for the order (default: auto-generated timestamp)
 * 
 * Example:
 *   TOKEN_ADDRESS=0x00000000000000000000000000000000006d30e2 \
 *   AMOUNT=1000000 \
 *   REFUND_ADDRESS=0xYourRefundAddress \
 *   MESSAGE_HASH=your-message-hash \
 *   npx hardhat run scripts/createOrder.ts --network hederaTestnet
 */

import { ethers, network } from "hardhat";
import { assertEnvironment, getContracts } from "./utils";
import { NETWORKS } from "./config";
import dotenv from "dotenv";

dotenv.config();

assertEnvironment();

// Standard ERC20 ABI (minimal interface for approve and balanceOf)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

async function main() {
  // Get signer from hardhat (uses network-specific private key)
  const [signer] = await ethers.getSigners();
  const wallet = signer;
  
  const { gatewayInstance } = await getContracts();
  const contractWithSigner = gatewayInstance.connect(wallet);

  // Get network config
  const chainId = network.config.chainId;
  if (!chainId) {
    throw new Error("Chain ID not found");
  }
  const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];
  if (!networkConfig) {
    throw new Error(`Network config not found for chainId ${chainId}`);
  }

  // Get parameters from environment variables or use defaults
  const tokenAddress = process.env.TOKEN_ADDRESS || Object.values(networkConfig.SUPPORTED_TOKENS)[0];
  const amount = process.env.AMOUNT || "10"; // Default: 1 USDC (6 decimals)
  const rate = process.env.RATE || "100"; // Default rate
  const senderFeeRecipient = process.env.SENDER_FEE_RECIPIENT || ethers.constants.AddressZero;
  const senderFee = process.env.SENDER_FEE || "0";
  const refundAddress = process.env.REFUND_ADDRESS || wallet.address;
  const messageHash = process.env.MESSAGE_HASH || "test-message-hash-" + Date.now();

  if (!tokenAddress) {
    throw new Error("Token address not found. Please set TOKEN_ADDRESS env var or configure SUPPORTED_TOKENS in config.ts");
  }

  console.log("\n📋 Order Creation Parameters:");
  console.log("=".repeat(60));
  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Gateway Contract: ${networkConfig.GATEWAY_CONTRACT}`);
  console.log(`Token Address: ${tokenAddress}`);
  console.log(`Amount: ${amount}`);
  console.log(`Rate: ${rate}`);
  console.log(`Sender Fee Recipient: ${senderFeeRecipient}`);
  console.log(`Sender Fee: ${senderFee}`);
  console.log(`Refund Address: ${refundAddress}`);
  console.log(`Message Hash: ${messageHash}`);
  console.log(`Wallet Address: ${wallet.address}`);
  console.log("=".repeat(60));

  // Get ERC20 token instance
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  // Check if token is supported
  const isSupported = await gatewayInstance.isTokenSupported(tokenAddress);
  if (!isSupported) {
    throw new Error(`Token ${tokenAddress} is not supported by Gateway`);
  }
  console.log("\n✅ Token is supported");

  // Check token balance
  const balance = await tokenContract.balanceOf(wallet.address);
  console.log(`\n💰 Token Balance: ${ethers.utils.formatUnits(balance, await tokenContract.decimals())}`);

  // Calculate total amount needed (amount + senderFee)
  const totalAmount = ethers.BigNumber.from(amount).add(ethers.BigNumber.from(senderFee));
  const balanceBN = ethers.BigNumber.from(balance.toString());

  if (balanceBN.lt(totalAmount)) {
    throw new Error(`Insufficient balance. Need ${ethers.utils.formatUnits(totalAmount, await tokenContract.decimals())}, have ${ethers.utils.formatUnits(balance, await tokenContract.decimals())}`);
  }

  // Check current allowance
  const currentAllowance = await tokenContract.allowance(wallet.address, networkConfig.GATEWAY_CONTRACT);
  console.log(`\n🔐 Current Allowance: ${ethers.utils.formatUnits(currentAllowance, await tokenContract.decimals())}`);

  // Approve if needed
  if (currentAllowance.lt(totalAmount)) {
    console.log(`\n📝 Approving Gateway to spend ${ethers.utils.formatUnits(totalAmount, await tokenContract.decimals())} tokens...`);
    const approveTx = await tokenContract.approve(networkConfig.GATEWAY_CONTRACT, totalAmount);
    console.log(`   Transaction hash: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("✅ Approval confirmed");
  } else {
    console.log("✅ Sufficient allowance already exists");
  }

  // Create order
  console.log(`\n🚀 Creating order...`);
  const tx = await contractWithSigner.createOrder(
    tokenAddress,
    amount,
    rate,
    senderFeeRecipient,
    senderFee,
    refundAddress,
    messageHash
  );

  console.log(`   Transaction hash: ${tx.hash}`);
  console.log(`   Waiting for confirmation...`);

  const receipt = await tx.wait();
  console.log(`✅ Order created successfully!`);

  // Extract order ID from event
  const orderCreatedEvent = receipt.events?.find((e: any) => e.event === "OrderCreated");
  if (orderCreatedEvent) {
    const orderId = orderCreatedEvent.args.orderId;
    console.log(`\n📦 Order ID: ${orderId}`);
    console.log(`\n📋 Transaction Details:`);
    console.log(`   Block Number: ${receipt.blockNumber}`);
    console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`   Order ID: ${orderId}`);
    
    // Get order info
    const orderInfo = await gatewayInstance.getOrderInfo(orderId);
    console.log(`\n📊 Order Info:`);
    console.log(`   Sender: ${orderInfo.sender}`);
    console.log(`   Token: ${orderInfo.token}`);
    console.log(`   Amount: ${ethers.utils.formatUnits(orderInfo.amount, await tokenContract.decimals())}`);
    console.log(`   Protocol Fee: ${ethers.utils.formatUnits(orderInfo.protocolFee, await tokenContract.decimals())}`);
    console.log(`   Sender Fee: ${ethers.utils.formatUnits(orderInfo.senderFee, await tokenContract.decimals())}`);
    console.log(`   Refund Address: ${orderInfo.refundAddress}`);
    console.log(`   Is Fulfilled: ${orderInfo.isFulfilled}`);
    console.log(`   Is Refunded: ${orderInfo.isRefunded}`);
  } else {
    console.log("\n⚠️  Could not find OrderCreated event in transaction receipt");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
