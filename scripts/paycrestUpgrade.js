const { ethers, upgrades } = require("hardhat");

async function main() {
  const USDC_ADDRESS = "0xFda3cD366b8C554Ba2c409d7E810833BB3390946";

  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.upgradeProxy(
    "0x643db3aa8adDFd1877453491d144aD184cf8261b",
    Paycrest
  );

  console.log("✅ upgrades paycrest.", paycrest.address);
}

main();
