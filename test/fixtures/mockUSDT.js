const { ethers } = require("hardhat");
const hardhat = require("hardhat");

async function mockUSDT() {
  // get mock usdc contract and deploy it
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const mockUSDT = await MockUSDT.deploy();
    await mockUSDT.deployed();
    console.log("MockUSDT deployed to:", mockUSDT.address);
    return { mockUSDT };
}
const mockUSDTFixture = hardhat.deployments.createFixture(mockUSDT);
module.exports = {
  mockUSDTFixture,
};
