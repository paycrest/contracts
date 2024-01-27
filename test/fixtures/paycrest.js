const { upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { mockUSDCFixture } = require("./mockUSDC.js");

async function paycrest() {
  const { mockUSDC } = await mockUSDCFixture();
  const paycrestFactory = await hardhat.ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(paycrestFactory);
  await paycrest.deployed();

  console.log("Paycrest deployed to:", paycrest.address);

  return { paycrest, mockUSDC };
}

const paycrestFixture = hardhat.deployments.createFixture(paycrest);

module.exports = {
  paycrestFixture
};

