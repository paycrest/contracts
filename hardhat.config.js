const fs = require("fs");
require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-ethers");

require("dotenv").config();

module.exports = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    // mumbai: {
    //   url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}}`,
    //   accounts: [process.env.pKey],
    //   chainId: 80001,
    //   USDC_ADDRESS: "0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747",
    //   saveDeployments: true,
    // },
  },
  solidity: {
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },

    compilers: [
      {
        version: "0.8.18",
      },
      {
        version: "0.8.9",
      },
    ],
  },
  etherscan: {
    apiKey: {
      arbitrumGoerli: process.env.ETHERSCAN_KEY,
      // arbitrumOne: ETHERSCAN_KEY,
    },
  },
};
