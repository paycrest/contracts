import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
// Note: @openzeppelin/hardhat-upgrades v3.9.1 is not compatible with Hardhat v3
// We'll manually deploy proxies in tests instead

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
		},
		base: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x2105/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		bsc: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x38/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		polygon: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x89/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		mainnet: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x1/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		optimisticEthereum: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x0a/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		scroll: {
			type: "http",
			url: "https://scroll.drpc.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		celo: {
			type: "http",
			url: "https://forno.celo.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		assetChain: {
			type: "http",
			url: "https://mainnet-rpc.assetchain.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		lisk: {
			type: "http",
			url: "https://rpc.api.lisk.com", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},

		// Testnets
		baseSepolia: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x14a34/${env.SHIELD3_API_KEY}/rpc`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
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
	mocha: {
		timeout: 40000,
	},
});