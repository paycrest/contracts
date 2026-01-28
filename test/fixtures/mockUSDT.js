import hre from "hardhat";

const { ethers } = await hre.network.connect();

async function mockUSDTFixture() {
  // get mock usdc contract and deploy it
  const mockUSDT = await ethers.deployContract("MockUSDT");
  console.log("MockUSDT deployed to:", await mockUSDT.getAddress());
  return { mockUSDT };
}

export { mockUSDTFixture };