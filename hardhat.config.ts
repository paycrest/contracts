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

let {
	DEPLOYER_PRIVATE_KEY,
	SHIELD3_API_KEY,
	ETHERSCAN_API_KEY,
	BASESCAN_API_KEY,
	ARBISCAN_API_KEY,
	BSCSCAN_API_KEY,
	POLYGONSCAN_API_KEY,
	OPTIMISM_API,
	SCROLL_API,
	CELO_API,
} = process.env;

const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001"

const config: HardhatUserConfig = {
	namedAccounts: {
		deployer: {
			default: 0, // here this will by default take the first account as deployer
		},
	},
	networks: {
		// Mainnets
		arbitrumOne: {
			url: `https://rpc.shield3.com/v3/0xa4b1/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42161,
			saveDeployments: true,
		},
		base: {
			url: `https://rpc.shield3.com/v3/0x2105/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 8453,
			saveDeployments: true,
		},
		bsc: {
			url: `https://rpc.shield3.com/v3/0x38/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 56,
			saveDeployments: true,
		},
		polygon: {
			url: `https://rpc.shield3.com/v3/0x89/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 137,
			saveDeployments: true,
			gasPrice: 25000000000,
		},
		mainnet: {
			url: `https://rpc.shield3.com/v3/0x1/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 1,
			saveDeployments: true,
		},
		optimisticEthereum: {
			url: `https://rpc.shield3.com/v3/0x0a/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 10,
			saveDeployments: true,
		},
		scroll: {
			url: "https://scroll.drpc.org", // @note this is a public rpc
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 534352,
			saveDeployments: true,
		},
		celo: {
			url: "https://forno.celo.org", // @note this is a public rpc
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42220,
			saveDeployments: true,
		},
		assetChain: {
			url: "https://mainnet-rpc.assetchain.org", // @note this is a public rpc
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42420,
			saveDeployments: true,
		},

		// Testnets
		arbitrumSepolia: {
			url: `https://rpc.shield3.com/v3/0x66eee/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 421614,
			gasPrice: "auto",
			saveDeployments: true,
		},
		amoy: {
			url: `https://rpc.shield3.com/v3/0x13882/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 80002,
			saveDeployments: true,
		},
		baseSepolia: {
			url: `https://rpc.shield3.com/v3/0x14a34/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 84532,
			saveDeployments: true,
		},
		sepolia: {
			url: `https://rpc.shield3.com/v3/0xaa36a7/${SHIELD3_API_KEY}/rpc`,
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 11155111,
			saveDeployments: true,
		},
		assetchainTestnet: {
			url: "https://enugu-rpc.assetchain.org/", // @note this is a public rpc
			accounts: [DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42421,
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
			base: BASESCAN_API_KEY!,
			baseSepolia: BASESCAN_API_KEY!,
			arbitrumOne: ARBISCAN_API_KEY!,
			arbitrumSepolia: ARBISCAN_API_KEY!,
			bsc: BSCSCAN_API_KEY!,
			polygon: POLYGONSCAN_API_KEY!,
			amoy: POLYGONSCAN_API_KEY!,
			mainnet: ETHERSCAN_API_KEY!,
			sepolia: ETHERSCAN_API_KEY!,
			optimisticEthereum: OPTIMISM_API!,
			scroll: SCROLL_API!,
			celo: CELO_API!,
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
			{
				network: "scroll",
				chainId: 534352,
				urls: {
					apiURL: "https://api.scrollscan.com/api",
					browserURL: "https://scrollscan.com/",
				},
			},
			{
				network: "baseSepolia",
				chainId: 84532,
				urls: {
					apiURL: "https://api-sepolia.basescan.org/api",
					browserURL: "https://sepolia.basescan.org",
				},
			},
			{
				network: "arbitrumSepolia",
				chainId: 421614,
				urls: {
					apiURL: "https://api-sepolia.arbiscan.io/api",
					browserURL: "https://sepolia.arbiscan.io",
				},
			},
			{
				network: "amoy",
				chainId: 80002,
				urls: {
					apiURL: "https://api-amoy.polygonscan.com/api",
					browserURL: "https://amoy.polygonscan.com",
				},
			},
			{
				network: "celo",
				chainId: 42220,
				urls: {
					apiURL: "https://api.celoscan.io/api",
					browserURL: "https://celoscan.io/",
				},
			},
			{
				network: "assetchain_test",
				chainId: 42421,
				urls: {
					apiURL: "https://scan-testnet.assetchain.org/api",
					browserURL: "https://scan-testnet.assetchain.org/",
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

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  for (const account of accounts) {
      console.log(
          "%s (%i ETH)",
          account.address,
          // hre.ethers.utils.formatEther(
              // getBalance returns wei amount, format to ETH amount
              await provider.getBalance(account.address)
          // )
      );
  }
});

export default config;