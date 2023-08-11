const { ethers, upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { NETWORKS } = require("../../scripts/config.js");
const chainId = 42161;
const { USDC_ADDRESS } = NETWORKS[chainId];

async function paycrest() {
  const paycrestFactory = await hardhat.ethers.getContractFactory("Paycrest");

  const paycrest = await upgrades.deployProxy(paycrestFactory, [
    USDC_ADDRESS,
  ]);
  await paycrest.deployed();
  console.log("paycrest deployed to:", paycrest.address);

  return { paycrest };
}

const paycrestFixture = hardhat.deployments.createFixture(paycrest);

module.exports = {
  paycrestFixture
};
