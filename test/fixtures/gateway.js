const { upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { mockUSDTFixture } = require("./mockUSDT.js");

async function gateway() {
  const { mockUSDT } = await mockUSDTFixture();
  const gatewayFactory = await hardhat.ethers.getContractFactory("Gateway");
  const gateway = await upgrades.deployProxy(gatewayFactory);
  await gateway.deployed();

  console.log("Gateway deployed to:", gateway.address);

  return { gateway, mockUSDT };
}

const gatewayFixture = hardhat.deployments.createFixture(gateway);

module.exports = {
  gatewayFixture
};

