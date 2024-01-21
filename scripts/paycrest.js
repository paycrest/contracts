const { ethers, upgrades } = require("hardhat");

async function main() {
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(Paycrest);
  console.log("✅ Deployed Paycrest: ", await paycrest.address);
}

main();
