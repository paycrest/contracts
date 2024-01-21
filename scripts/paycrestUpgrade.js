const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyContractAddress = "0x3fE1246CbC4eDf2A4f51f7CF442277bA863823e1";
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.upgradeProxy(
    proxyContractAddress,
    Paycrest
  );

  console.log("✅ Upgraded Paycrest proxy", paycrest.address);

  // verify contract
  // run("verify:verify", {
  //   address: paycrest.address,
  // });
}

main();
