require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("@nomiclabs/hardhat-ethers");

require("dotenv").config();

const { DEPLOYER_PRIVATE_KEY, ALCHEMY_API_KEY, ETHERSCAN_API_KEY } =
  process.env;

module.exports = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
    //   forking: {
    //     url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    //   },
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_API_KEY}}`,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 80001,
      USDC_ADDRESS: "0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747",
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};