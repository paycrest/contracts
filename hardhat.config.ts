import { defineConfig, task } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";

import dotenv from "dotenv";
const dotEnvResult = dotenv.config();
const env = (dotEnvResult.parsed ?? {}) as Record<string, string>;

const testPrivateKey = "0000000000000000000000000000000000000000000000000000000000000001";

/** Default Hardhat signers: deploy/upgradeProxy use DEPLOYER. Upgrade tasks opt into NEW_OWNER separately. */
function networkAccounts(): string[] {
	return [
		process.env.DEPLOYER_PRIVATE_KEY ||
			env.DEPLOYER_PRIVATE_KEY ||
			process.env.NEW_OWNER_PRIVATE_KEY ||
			env.NEW_OWNER_PRIVATE_KEY ||
			testPrivateKey,
	];
}

const printAccounts = task("accounts", "Print the accounts")
  .setAction(() => import("./tasks/accounts.js"))
  .build();

const flattenContracts = task("flat", "Flattens and prints contracts and their dependencies (Resolves licenses)")
  .setAction(() => import("./tasks/flatten.js"))
  .build();

const upgradeAllEvm = task("upgrade-all-evm", "Upgrade Gateway proxy on all configured EVM networks")
  .addFlag({ name: "dryRun", description: "Print planned upgrades without sending transactions" })
  .addFlag({ name: "setFees", description: "Call setTokenFeeSettings on each network after upgrade" })
  .addFlag({ name: "updateConfig", description: "Write new gatewayImplementation addresses to scripts/config.ts" })
  .addFlag({ name: "yes", description: "Skip confirmation prompt" })
  .addFlag({ name: "failFast", description: "Stop on first network failure (default: continue)" })
  .addOption({
    name: "networks",
    description: "Comma-separated chain IDs or names (e.g. base,8453)",
    defaultValue: "",
  })
  .setAction(() => import("./tasks/upgradeAllEvmRunner.js"))
  .build();

const transferOwnershipAllEvm = task(
  "transfer-ownership-all-evm",
  "Transfer Gateway (Ownable2Step) and/or ProxyAdmin ownership across EVM mainnets",
)
  .addFlag({ name: "dryRun", description: "Print planned transfers without sending transactions" })
  .addFlag({ name: "yes", description: "Skip confirmation prompt" })
  .addFlag({ name: "failFast", description: "Stop on first network failure (default: continue)" })
  .addFlag({ name: "gatewayOnly", description: "Only transfer Gateway ownership" })
  .addFlag({ name: "proxyAdminOnly", description: "Only transfer ProxyAdmin ownership" })
  .addFlag({ name: "sequential", description: "Run chains one-by-one instead of in parallel" })
  .addOption({
    name: "newOwner",
    description: "Address to transfer ownership to",
    defaultValue: "",
  })
  .addOption({
    name: "networks",
    description: "Comma-separated chain IDs or names (e.g. base,8453)",
    defaultValue: "",
  })
  .setAction(() => import("./tasks/transferOwnershipAllEvmRunner.js"))
  .build();

export default defineConfig({
	plugins: [hardhatToolboxMochaEthers, hardhatVerify, hardhatEthers, hardhatTypechain, hardhatNetworkHelpers],
	tasks: [printAccounts, flattenContracts, upgradeAllEvm, transferOwnershipAllEvm],
	networks: {
		// Mainnets
		arbitrumOne: {
			type: "http",
			url: `https://arb1.arbitrum.io/rpc`,
			accounts: networkAccounts(),
		},
		base: {
			type: "http",
			url: `https://base-public.nodies.app`,
			accounts: networkAccounts(),
		},
		bsc: {
			type: "http",
			url: `https://bsc.drpc.org`,
			accounts: networkAccounts(),
		},
		polygon: {
			type: "http",
			url: `https://polygon.drpc.org`,
			accounts: networkAccounts(),
		},
		mainnet: {
			type: "http",
			url: `https://ethereum.publicnode.com`,
			accounts: networkAccounts(),
		},
		optimisticEthereum: {
			type: "http",
			url: `https://optimism-rpc.publicnode.com`,
			accounts: networkAccounts(),
		},
		scroll: {
			type: "http",
			url: "https://scroll.drpc.org", // @note this is a public rpc
			accounts: networkAccounts(),
		},
		celo: {
			type: "http",
			url: "https://forno.celo.org", // @note this is a public rpc
			chainId: 42220,
			accounts: networkAccounts(),
		},
		assetChain: {
			type: "http",
			url: "https://mainnet-rpc.assetchain.org", // @note this is a public rpc
			accounts: networkAccounts(),
		},
		lisk: {
			type: "http",
			url: "https://rpc.api.lisk.com",
			accounts: networkAccounts(),
		},

		// Testnets
		baseSepolia: {
			type: "http",
			url: `https://rpc.shield3.com/v3/0x14a34/${env.SHIELD3_API_KEY}/rpc`,
			accounts: networkAccounts(),
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
	// Foundry owns test/foundry/*.sol (OTCGateway verification harness). Keep Hardhat's own Solidity test
	// runner pointed elsewhere so it never tries to compile forge-std based tests.
	paths: {
		tests: {
			mocha: "test",
			solidity: "test/hardhat-solidity",
		},
	},
	test: {
		solidity: {
			timeout: 40000,
		},
	},
});
