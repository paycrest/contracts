import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

import dotenv from "dotenv";
const dotEnvResult = dotenv.config();
const env = (dotEnvResult.parsed ?? {}) as Record<string, string>;

const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001"

export default defineConfig({
	plugins: [hardhatToolboxMochaEthers, hardhatVerify],
	networks: {
		// Mainnets
		arbitrumOne: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0xa4b1/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42161,
			saveDeployments: true,
		},
		base: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x2105/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 8453,
			saveDeployments: true,
		},
		bsc: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x38/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 56,
			saveDeployments: true,
		},
		polygon: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x89/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 137,
			saveDeployments: true,
		},
		mainnet: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x1/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 1,
			saveDeployments: true,
		},
		optimisticEthereum: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x0a/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 10,
			saveDeployments: true,
		},
		scroll: {
			type: "http",
			url: "https://scroll.drpc.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 534352,
			saveDeployments: true,
		},
		celo: {
			type: "http",
			url: "https://forno.celo.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42220,
			saveDeployments: true,
		},
		assetChain: {
			type: "http",
			url: "https://mainnet-rpc.assetchain.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 42420,
			saveDeployments: true,
		},
		lisk: {
			type: "http",
			url: "https://rpc.api.lisk.com", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 1135,
			saveDeployments: true,
		},

		// Testnets
		baseSepolia: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x14a34/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
			chainId: 84532,
			saveDeployments: true,
		},
	},
	solidity: {
		compilers: [
			{
				version: "0.8.18",
				settings: {
					optimizer: {
						enabled: false,
						runs: 200,
					},
				},
			},
			{
				version: "0.8.9",
				settings: {
					optimizer: {
						enabled: false,
						runs: 200,
					},
				},
			},
			{
				version: "0.8.20",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
		],
	},
	verify: {
		etherscan: {
			apiKey: env.ETHERSCAN_API_KEY || "",
		}
	},
	chainDescriptors: {
		42220: {
			name: "celo",
			blockExplorers: {
				etherscan: {
					name: "celoscan",
					url: "https://api.celoscan.io/api",
					apiUrl: "https://celoscan.io/",
				},
			},
		},
		534352: {
			name: "scroll",
			blockExplorers: {
				etherscan: {
					name: "Scroll Explorer",
					url: "https://api.scrollscan.com/api",
					apiUrl: "https://scrollscan.com/",
				},
			},
		},
		1135: {
			name: "lisk",
			blockExplorers: {
				etherscan: {
					name: "Lisk Explorer",
					url: "https://explorer.lisk.com/api",
					apiUrl: "https://explorer.lisk.com",
				},
			},
		},
	},
});