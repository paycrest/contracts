require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

let { DEPLOYER_PRIVATE_KEY, ALCHEMY_API_KEY, INFURA_API_KEY } = process.env;

module.exports = {
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  networks: {
    hardhat: {
      saveDeployments: true,
      forking: {
        url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
        enabled: true,
        // blockNumber: 103882851, // (Mar-25-2023 04:09:31 PM +UTC)
      },
      // allowUnlimitedContractSize: true,
    },
    mumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 80001,
      saveDeployments: true,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 97,
      saveDeployments: true,
    },
    baseGoerli: {
      url: "https://goerli.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 84531,
      gasPrice: 1000000000,
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
      "base": process.env.BASE_API_KEY,
      arbitrumOne: process.env.ARBISCAN_API_KEY,
      bsc: process.env.BSCSCAN_API_KEY,
      polygonMumbai: process.env.POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },

};
