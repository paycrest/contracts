const { ethers, upgrades } = require("hardhat");
const hardhat = require("hardhat");

async function mockUSDC() {
  // get mock usdc contract and deploy it
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.deployed();
    console.log("MockUSDC deployed to:", mockUSDC.address);
    return { mockUSDC };
}
const mockUSDCFixture = hardhat.deployments.createFixture(mockUSDC);
module.exports = {
  mockUSDCFixture,
};
