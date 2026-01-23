import hre from "hardhat";

// Connect to network and get ethers instance (Hardhat v3 pattern)
const { ethers } = await hre.network.connect();

export async function mockUSDTFixture() {
  // Deploy contract using Hardhat v3 pattern
  const mockUSDT = await ethers.deployContract("MockUSDT");
  console.log("MockUSDT deployed to:", await mockUSDT.getAddress());
  return { mockUSDT };
}
