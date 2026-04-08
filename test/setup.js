import hre from "hardhat";

// Single shared network connection for all test modules.
// All fixtures, utils, and test files import from here so they share
// the same ethers provider and EVM state.
export const { ethers } = await hre.network.connect();
