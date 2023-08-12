// scripts/create-box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  const USDC_ADDRESS = "0xFda3cD366b8C554Ba2c409d7E810833BB3390946";
  
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(Paycrest, [USDC_ADDRESS]);
  console.log("paycrest deployed to:", await paycrest.address);
  console.log("✅ Deployed Paycrest.");

  const PaycrestValidator = await ethers.getContractFactory("PaycrestValidator");
  const paycrestValidator = await upgrades.deployProxy(PaycrestValidator, [paycrest.address]);
  console.log("paycrestValidator deployed to:", await paycrestValidator.address);
  console.log("✅ Deployed paycrestValidator.");
}

main();
