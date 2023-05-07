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
      accounts: [
        "df1fac1892fa24350521292740fb6bf0d3d981181dbeabffa0aa928b5a54f188",
      ],
      chainId: 80001,
      saveDeployments: true,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts: [
        "df1fac1892fa24350521292740fb6bf0d3d981181dbeabffa0aa928b5a54f188",
      ],
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
      // arbitrumGoerli: process.env.ETHERSCAN_KEY,÷      // arbitrumOne: ETHERSCAN_KEY,
    },
  },
};
