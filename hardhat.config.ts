import "hardhat-deploy";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import { task, types } from "hardhat/config";
import type { HardhatUserConfig } from "hardhat/types";

import dotenv from "dotenv";

dotenv.config();

let { DEPLOYER_PRIVATE_KEY, ALCHEMY_API_KEY, INFURA_API_KEY, BASE_API_KEY, ARBISCAN_API_KEY, BSCSCAN_API_KEY, POLYGONSCAN_API_KEY } = process.env;

const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001"

const config: HardhatUserConfig = {
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
      accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
      chainId: 80001,
      saveDeployments: true,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s3.binance.org:8545/",
      accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
      chainId: 97,
      saveDeployments: true,
    },
    baseGoerli: {
      url: "https://goerli.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
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
      "base": BASE_API_KEY!,
      arbitrumOne: ARBISCAN_API_KEY!,
      bsc: BSCSCAN_API_KEY!,
      polygonMumbai: POLYGONSCAN_API_KEY!,
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

task("flat", "Flattens and prints contracts and their dependencies (Resolves licenses)")
  .addOptionalVariadicPositionalParam("files", "The files to flatten", undefined, types.inputFile)
  .setAction(async ({ files }, hre) => {
    let flattened = await hre.run("flatten:get-flattened-sources", { files });
    
    // Remove every line started with "// SPDX-License-Identifier:"
    flattened = flattened.replace(/SPDX-License-Identifier:/gm, "License-Identifier:");
    flattened = `// SPDX-License-Identifier: MIXED\n\n${flattened}`;

    // Remove every line started with "pragma experimental ABIEncoderV2;" except the first one
    flattened = flattened.replace(/pragma experimental ABIEncoderV2;\n/gm, ((i) => (m: any) => (!i++ ? m : ""))(0));
    console.log(flattened);
  });

export default config;