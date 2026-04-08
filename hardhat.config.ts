import { defineConfig, task  } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";
// import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

import dotenv from "dotenv";
const dotEnvResult = dotenv.config();
const env = (dotEnvResult.parsed ?? {}) as Record<string, string>;

const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001"

const printAccounts = task("accounts", "Print the accounts")
  .setAction(() => import("./tasks/accounts.js"))
  .build();

const flattenContracts = task("flat", "Flattens and prints contracts and their dependencies (Resolves licenses)")
  .setAction(() => import("./tasks/flatten.js"))
  .build();


export default defineConfig({
	plugins: [hardhatToolboxMochaEthers, hardhatVerify, hardhatEthers, hardhatTypechain, hardhatEthersChaiMatchers, hardhatNetworkHelpers],
	tasks: [printAccounts, flattenContracts],
	networks: {
		// Mainnets
		arbitrumOne: {
			type: "http",
			url: `https://api.zan.top/arb-one`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		base: {
			type: "http",
			url: `https://base-public.nodies.app`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		bsc: {
			type: "http",
			url: `https://bsc.drpc.org`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		polygon: {
			type: "http",
			url: `https://1rpc.io/matic`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		mainnet: {
			type: "http",
			url: `https://ethereum.public.blockpi.network/v1/rpc/public`,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		optimisticEthereum: {
			type: "http",
			url: `https://optimism-rpc.publicnode.com`,
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
			chainId: 42220,
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		assetChain: {
			type: "http",
			url: "https://mainnet-rpc.assetchain.org", // @note this is a public rpc
			accounts: [env.DEPLOYER_PRIVATE_KEY || testPrivateKey],
		},
		lisk: {
			type: "http",
			url: "https://lisk.drpc.org", // @note this is a public rpc
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
		npmFilesToBuild: [
			"@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
			"@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
		],
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
			// For Celo verification use CELOSCAN_API_KEY (get one at https://celoscan.io/myapikey)
			apiKey: env.CELOSCAN_API_KEY || env.BASESCAN_API_KEY || env.ETHERSCAN_API_KEY || "",
		}
	},
	chainDescriptors: {
		42220: {
			name: "celo",
			blockExplorers: {
				etherscan: {
					name: "celoscan",
					url: "https://celoscan.io",
					apiUrl: "https://api.etherscan.io/v2/api",
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
	test: {
		solidity: {
			timeout: 40000,
		},
	},
});