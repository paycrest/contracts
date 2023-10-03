const { ethers, upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { NETWORKS } = require("../../scripts/config.js");
const { mockUSDCFixture } = require("./mockUSDC.js");
const chainId = 42161;
const { USDC_ADDRESS } = NETWORKS[chainId];

async function paycrest() {
  const { mockUSDC } = await mockUSDCFixture();
  const paycrestFactory = await hardhat.ethers.getContractFactory("Paycrest");

  const paycrest = await upgrades.deployProxy(paycrestFactory, [mockUSDC.address]);
  await paycrest.deployed();
  console.log("paycrest deployed to:", paycrest.address);

  return { paycrest, mockUSDC };
}

const paycrestFixture = hardhat.deployments.createFixture(paycrest);

module.exports = {
  paycrestFixture
};

