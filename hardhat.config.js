require("@nomiclabs/hardhat-ethers");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("@nomiclabs/hardhat-etherscan");

require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

let { ALCHEMY_API_KEY, ALCHEMY_API_KEY_TEST } = process.env;
/** @dev due to limitations with Github CI/CD we need to use disposable API key */
ALCHEMY_API_KEY = ALCHEMY_API_KEY || "v2/1rZ8M4R4mD6wzO4x4a4j9X3N3q3F3Z3J";
const pk =
  process.env.DEPLOYER_PRIVATE_KEY ||
  ethers.utils.hexlify(ethers.utils.randomBytes(32));

module.exports = {
  networks: {
    hardhat: {

    },
    arbmain: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      // accounts: [pk],
      chainId: 42161,
      saveDeployments: true,
    },
    arbgoerli: {
      url: `https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_API_KEY_TEST}`, 
      accounts: [pk],
      chainId: 421613,
      saveDeployments: true,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.18",
      },
    ],
  },
  etherscan: {
    apiKey: {
      arbitrumGoerli: process.env.ETHERSCAN_KEY,
      // arbitrumOne: ETHERSCAN_KEY,
    },
  },
  gasReporter: {
    enabled: parseInt(process.env.REPORT_GAS) === 1 ? true : false,
  },
};
