import { readFileSync, promises as fs } from "fs";
import path from "path";
import { Contract, ContractFactory, formatEther, JsonRpcProvider, Network, Wallet, getAddress } from "ethers";
import { NETWORKS } from "./config";
import { rpcCandidates } from "./rpcUrls";

const IMPLEMENTATION_SLOT =
	"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_ADMIN_ABI = [
	"function upgrade(address proxy, address implementation) public",
];

export const CHAIN_NAMES: Record<number, string> = {
	1: "ethereum",
	56: "bsc",
	137: "polygon",
	8453: "base",
	42161: "arbitrum",
	534352: "scroll",
	42220: "celo",
	1135: "lisk",
};

export type UpgradeResult = {
	chainId: number;
	networkName: string;
	proxy: string;
	previousImplementation: string;
	newImplementation: string;
	upgradeTxHash: string;
	feeTxHashes: string[];
	skipped: boolean;
	deployerBalance?: string;
	error?: string;
};

export type UpgradeOptions = {
	dryRun?: boolean;
	setFees?: boolean;
	updateConfig?: boolean;
};

/** EVM mainnets with Gateway proxies in scripts/config.ts (excludes Tron). */
export const EVM_MAINNET_CHAIN_IDS = [
	1, 56, 137, 42161, 8453, 534352, 42220, 1135,
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const RPC_PROBE_TIMEOUT_MS = Number(process.env.RPC_PROBE_TIMEOUT_MS ?? 15_000);
const RPC_OPERATION_TIMEOUT_MS = Number(process.env.RPC_OPERATION_TIMEOUT_MS ?? 45_000);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(
			() => reject(new Error(`${label} timed out after ${ms}ms`)),
			ms,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	}
}

function getProxyAdmin(chainId: number): string {
	const envOverride = process.env[`PROXY_ADMIN_${chainId}`];
	if (envOverride) {
		return getAddress(envOverride);
	}

	const fromConfig = NETWORKS[chainId as keyof typeof NETWORKS]?.proxyAdmin;
	if (fromConfig) {
		return getAddress(fromConfig);
	}

	return ZERO_ADDRESS;
}

function createProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
	const network = Network.from(chainId);
	return new JsonRpcProvider(rpcUrl, network, { staticNetwork: network, batchMaxCount: 1 });
}

async function withRpcProvider<T>(
	chainId: number,
	configuredUrl: string,
	fn: (provider: JsonRpcProvider) => Promise<T>,
): Promise<T> {
	const candidates = rpcCandidates(chainId, configuredUrl);
	let lastError: Error | undefined;

	for (const rpcUrl of candidates) {
		const provider = createProvider(rpcUrl, chainId);
		try {
			await withTimeout(provider.getBlockNumber(), RPC_PROBE_TIMEOUT_MS, `rpc probe ${rpcUrl}`);
			const result = await withTimeout(fn(provider), RPC_OPERATION_TIMEOUT_MS, `rpc ${rpcUrl}`);
			if (candidates.length > 1) {
				console.log(`  using rpc ${rpcUrl}`);
			}
			return result;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (candidates.length > 1) {
				console.warn(`  rpc unavailable (${rpcUrl}): ${lastError.message}`);
			}
			provider.destroy();
		}
	}

	throw lastError ?? new Error("No RPC endpoint available");
}

function storageAddress(slotValue: string): string {
	const hex = slotValue.replace("0x", "").padStart(64, "0");
	return getAddress("0x" + hex.slice(-40));
}

async function readStorageAddress(
	provider: JsonRpcProvider,
	proxy: string,
	slot: string,
): Promise<string> {
	const raw = await provider.getStorage(proxy, slot);
	return storageAddress(raw);
}

function loadGatewayArtifact(): { abi: unknown; bytecode: string } {
	const artifactPath = path.join(process.cwd(), "build/contracts/Gateway.json");
	const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
		abi: unknown;
		bytecode: string;
	};
	if (!artifact.bytecode || artifact.bytecode === "0x") {
		throw new Error("Gateway artifact missing bytecode — run `npx hardhat compile` first");
	}
	return artifact;
}

export function resolveTargetChainIds(params: { networks?: string }): number[] {
	let chainIds = [...EVM_MAINNET_CHAIN_IDS].filter((chainId) => {
		const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
		return cfg?.gatewayContract && cfg.gatewayContract.length > 0;
	});

	if (params.networks) {
		const wanted = new Set(
			params.networks.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean),
		);
		chainIds = chainIds.filter((chainId) => {
			const name = CHAIN_NAMES[chainId]?.toLowerCase();
			return wanted.has(String(chainId)) || (name !== undefined && wanted.has(name));
		});
		if (chainIds.length === 0) {
			throw new Error(`No matching networks for: ${params.networks}`);
		}
	}

	return chainIds;
}

async function updateImplementationInConfig(chainId: number, implementationAddress: string) {
	const configFilePath = path.join(process.cwd(), "scripts/config.ts");
	let configContent = await fs.readFile(configFilePath, "utf-8");
	const networkRegex = new RegExp(`(${chainId}:\\s*{[\\s\\S]*?)(},?)`, "g");

	if (!networkRegex.test(configContent)) {
		console.warn(`  config.ts: no block for chainId ${chainId}, skipping config update`);
		return;
	}

	configContent = configContent.replace(networkRegex, (match) => {
		const lines = match.split("\n");
		let found = false;
		const updatedLines = lines.map((line) => {
			if (line.trim().startsWith("gatewayImplementation:")) {
				found = true;
				return line.replace(
					/gatewayImplementation:.*/,
					`gatewayImplementation: "${implementationAddress}",`,
				);
			}
			return line;
		});
		if (!found) {
			updatedLines.splice(-1, 0, `\t\tgatewayImplementation: "${implementationAddress}",`);
		}
		return updatedLines.join("\n");
	});

	await fs.writeFile(configFilePath, configContent, "utf-8");
	console.log(`  config.ts: updated gatewayImplementation for chainId ${chainId}`);
}

async function setTokenFeeSettings(
	wallet: Wallet,
	gateway: Contract,
	chainId: number,
): Promise<string[]> {
	const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];
	const txHashes: string[] = [];

	for (const [tokenName, tokenConfig] of Object.entries(networkConfig.supportedTokens)) {
		const tx = await gateway.setTokenFeeSettings(
			tokenConfig.address,
			tokenConfig.senderToTreasury,
			tokenConfig.providerToTreasury,
		);
		const receipt = await tx.wait();
		txHashes.push(receipt.hash);
		console.log(
			`  fees ${tokenName}: senderToTreasury=${tokenConfig.senderToTreasury} providerToTreasury=${tokenConfig.providerToTreasury} tx=${receipt.hash}`,
		);
	}

	return txHashes;
}

export async function upgradeGatewayOnChain(
	chainId: number,
	privateKey: string,
	options: UpgradeOptions = {},
): Promise<UpgradeResult> {
	const networkName = CHAIN_NAMES[chainId] ?? `chain-${chainId}`;
	const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];
	const base: UpgradeResult = {
		chainId,
		networkName,
		proxy: networkConfig?.gatewayContract ?? "",
		previousImplementation: "",
		newImplementation: "",
		upgradeTxHash: "",
		feeTxHashes: [],
		skipped: false,
	};

	if (!networkConfig?.gatewayContract) {
		return { ...base, skipped: true, error: "No gatewayContract in config" };
	}

	const proxy = networkConfig.gatewayContract;
	const proxyAdminAddress = getProxyAdmin(chainId);

	if (options.dryRun) {
		try {
			const snapshot = await withRpcProvider(chainId, networkConfig.rpcUrl, async (provider) => {
				const wallet = new Wallet(privateKey, provider);
				const balance = await provider.getBalance(wallet.address);
				const previousImplementation = await readStorageAddress(provider, proxy, IMPLEMENTATION_SLOT);
				return {
					previousImplementation,
					deployerBalance: formatEther(balance),
				};
			});

			console.log(`  [dry-run] would upgrade ${networkName} proxy ${proxy}`);
			console.log(`  [dry-run] current implementation ${snapshot.previousImplementation}`);
			console.log(`  [dry-run] proxy admin ${proxyAdminAddress}`);
			console.log(`  [dry-run] deployer balance ${snapshot.deployerBalance} native`);

			return {
				...base,
				proxy,
				skipped: true,
				previousImplementation: snapshot.previousImplementation,
				deployerBalance: snapshot.deployerBalance,
				error: proxyAdminAddress === ZERO_ADDRESS ? `Set proxyAdmin in config or PROXY_ADMIN_${chainId}` : undefined,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.log(`  [dry-run] would upgrade ${networkName} proxy ${proxy}`);
			console.error(`  [dry-run] could not fetch on-chain state: ${message}`);
			return { ...base, proxy, skipped: true, error: message };
		}
	}

	if (proxyAdminAddress === ZERO_ADDRESS) {
		return { ...base, proxy, error: `Set proxyAdmin in config or PROXY_ADMIN_${chainId}` };
	}

	try {
		return await withRpcProvider(chainId, networkConfig.rpcUrl, async (provider) => {
			const wallet = new Wallet(privateKey, provider);
			const artifact = loadGatewayArtifact();

			const balance = await provider.getBalance(wallet.address);
			if (balance === 0n) {
				return {
					...base,
					proxy,
					error: `Deployer ${wallet.address} has 0 native balance`,
				};
			}

			const previousImplementation = await readStorageAddress(provider, proxy, IMPLEMENTATION_SLOT);
			base.previousImplementation = previousImplementation;

			const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
			const implContract = await factory.deploy();
			await implContract.waitForDeployment();
			const newImplementation = await implContract.getAddress();

			if (previousImplementation.toLowerCase() === newImplementation.toLowerCase()) {
				return {
					...base,
					proxy,
					newImplementation,
					error: "New implementation address equals current implementation",
				};
			}

			const proxyAdmin = new Contract(proxyAdminAddress, PROXY_ADMIN_ABI, wallet);
			const upgradeTx = await proxyAdmin.upgrade(proxy, newImplementation);
			const upgradeReceipt = await upgradeTx.wait();

			console.log(`  upgraded: impl ${newImplementation} tx ${upgradeReceipt.hash}`);

			const gateway = new Contract(proxy, artifact.abi, wallet);
			if (options.setFees) {
				base.feeTxHashes = await setTokenFeeSettings(wallet, gateway, chainId);
			}

			if (options.updateConfig) {
				await updateImplementationInConfig(chainId, newImplementation);
			}

			return {
				...base,
				proxy,
				newImplementation,
				upgradeTxHash: upgradeReceipt.hash,
				skipped: false,
			};
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ...base, proxy, error: message };
	}
}

export async function upgradeAllEvmNetworks(params: {
	privateKey: string;
	networks?: string;
	dryRun?: boolean;
	setFees?: boolean;
	updateConfig?: boolean;
	continueOnError?: boolean;
}): Promise<UpgradeResult[]> {
	const chainIds = resolveTargetChainIds({ networks: params.networks });
	const results: UpgradeResult[] = [];

	console.log(`\nUpgrading Gateway on ${chainIds.length} EVM network(s)...\n`);

	for (const chainId of chainIds) {
		const name = CHAIN_NAMES[chainId] ?? String(chainId);
		console.log(`========== ${name} (${chainId}) ==========`);

		try {
			const result = await upgradeGatewayOnChain(chainId, params.privateKey, {
				dryRun: params.dryRun,
				setFees: params.setFees,
				updateConfig: params.updateConfig,
			});
			results.push(result);
			if (result.error && !params.dryRun) {
				console.error(`  failed: ${result.error}`);
				if (!params.continueOnError) {
					break;
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`  failed: ${message}`);
			results.push({
				chainId,
				networkName: name,
				proxy: NETWORKS[chainId as keyof typeof NETWORKS]?.gatewayContract ?? "",
				previousImplementation: "",
				newImplementation: "",
				upgradeTxHash: "",
				feeTxHashes: [],
				skipped: false,
				error: message,
			});
			if (!params.continueOnError) {
				break;
			}
		}
	}

	return results;
}

export function printUpgradeSummary(results: UpgradeResult[], dryRun = false) {
	console.log("\n========== Summary ==========");
	console.table(
		results.map((r) => ({
			network: r.networkName,
			chainId: r.chainId,
			status: r.error ? "FAILED" : dryRun ? "DRY-RUN" : r.skipped ? "SKIPPED" : "OK",
			proxy: r.proxy,
			implementation: r.previousImplementation || r.newImplementation || "-",
			deployerBalance: r.deployerBalance ?? "-",
			error: r.error ?? "",
		})),
	);

	const failed = results.filter((r) => r.error && !r.skipped && !dryRun);
	if (failed.length > 0) {
		console.error(`\n${failed.length} network(s) failed.`);
	}
}
