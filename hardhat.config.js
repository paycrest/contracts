require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-ethers");
require("hardhat-deploy");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();
let { DEPLOYER_PRIVATE_KEY, ALCHEMY_KEY } = process.env;

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
        url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
        enabled: true,
        // blockNumber: 103882851, // (Mar-25-2023 04:09:31 PM +UTC)
      },
      // allowUnlimitedContractSize: true,
    },
    mumbai: {
      url: "https://polygon-mumbai.infura.io/v3/4458cf4d1689497b9a38b1d6bbf05e78", //process.env.POLYGON_MUMBAI_RPC_URL, //"https://rpc-mumbai.maticvigil.com/",
      accounts: DEPLOYER_PRIVATE_KEY,
      chainId: 80001,
      saveDeployments: true,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts: DEPLOYER_PRIVATE_KEY,
      chainId: 97,
      saveDeployments: true,
    },
    baseGoerli: {
      url: "https://goerli.base.org",
      accounts: DEPLOYER_PRIVATE_KEY,
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
      "base-goerli": process.env.BASE_API_KEY,
      // arbitrumGoerli: process.env.ETHERSCAN_KEY,÷      // arbitrumOne: ETHERSCAN_KEY,
      polygonMumbai: "C9WPAJNVQZMB5VGD1VQ7I1H2H6WZPRSG7A",
    },
    customChains: [
      {
        network: "base-goerli",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org",
        },
      },
    ],
  },

};
