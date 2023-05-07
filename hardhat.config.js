require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-ethers");

require("dotenv").config();

module.exports = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    mumbai: {
      url: "https://matic-mumbai.chainstacklabs.com",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainId: 80001,
      saveDeployments: true,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainId: 97,
      saveDeployments: true,
    },
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
