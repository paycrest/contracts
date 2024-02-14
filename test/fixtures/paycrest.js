const { upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { mockUSDTFixture } = require("./mockUSDT.js");

async function paycrest() {
  const { mockUSDT } = await mockUSDTFixture();
  const paycrestFactory = await hardhat.ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(paycrestFactory);
  await paycrest.deployed();

  console.log("Paycrest deployed to:", paycrest.address);

  return { paycrest, mockUSDT };
}

const paycrestFixture = hardhat.deployments.createFixture(paycrest);

module.exports = {
  paycrestFixture
};

