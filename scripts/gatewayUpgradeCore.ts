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
	/** If set, skip impl deploy and ProxyAdmin.upgrade to this address. */
	implementation?: string;
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

function chainTag(chainId: number): string {
	return CHAIN_NAMES[chainId] ?? String(chainId);
}

function chainLog(chainId: number, message: string) {
	console.log(`[${chainTag(chainId)}] ${message}`);
}

function chainWarn(chainId: number, message: string) {
	console.warn(`[${chainTag(chainId)}] ${message}`);
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

async function connectRpcProvider(
	chainId: number,
	configuredUrl: string,
): Promise<{ provider: JsonRpcProvider; rpcUrl: string }> {
	const candidates = rpcCandidates(chainId, configuredUrl);
	let lastError: Error | undefined;

	for (const rpcUrl of candidates) {
		const provider = createProvider(rpcUrl, chainId);
		try {
			await withTimeout(provider.getBlockNumber(), RPC_PROBE_TIMEOUT_MS, `rpc probe ${rpcUrl}`);
			if (candidates.length > 1) {
				chainLog(chainId, `using rpc ${rpcUrl}`);
			}
			return { provider, rpcUrl };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (candidates.length > 1) {
				chainWarn(chainId, `rpc unavailable (${rpcUrl}): ${lastError.message}`);
			}
			provider.destroy();
		}
	}

	throw lastError ?? new Error("No RPC endpoint available");
}

async function withRpcProvider<T>(
	chainId: number,
	configuredUrl: string,
	fn: (provider: JsonRpcProvider) => Promise<T>,
): Promise<T> {
	const { provider } = await connectRpcProvider(chainId, configuredUrl);
	try {
		return await withTimeout(fn(provider), RPC_OPERATION_TIMEOUT_MS, `rpc chain ${chainId}`);
	} finally {
		provider.destroy();
	}
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

async function waitForContractCode(
	provider: JsonRpcProvider,
	address: string,
	label: string,
): Promise<void> {
	for (let attempt = 1; attempt <= 15; attempt++) {
		const code = await provider.getCode(address);
		if (code !== "0x" && code.length > 2) {
			return;
		}
		if (attempt === 15) {
			throw new Error(`${label}: no contract code at ${address} after deploy`);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
}

function loadGatewayArtifact(): { abi: unknown; bytecode: string } {
	const candidates = [
		path.join(process.cwd(), "artifacts/contracts/Gateway.sol/Gateway.json"),
		path.join(process.cwd(), "build/contracts/Gateway.json"),
	];

	for (const artifactPath of candidates) {
		try {
			const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
				abi: unknown;
				bytecode: string;
			};
			if (artifact.bytecode && artifact.bytecode !== "0x") {
				return artifact;
			}
		} catch {
			// try next path
		}
	}

	throw new Error(
		"Gateway artifact missing bytecode — run `npx hardhat compile` (artifacts/contracts/Gateway.sol/Gateway.json)",
	);
}

function findNetworkBlock(content: string, chainId: number): { start: number; end: number } | null {
	const key = `${chainId}:`;
	const keyIndex = content.indexOf(key);
	if (keyIndex === -1) {
		return null;
	}

	const braceStart = content.indexOf("{", keyIndex);
	if (braceStart === -1) {
		return null;
	}

	let depth = 0;
	let inString: '"' | "'" | "`" | null = null;
	let escaped = false;

	for (let i = braceStart; i < content.length; i++) {
		const char = content[i];

		if (escaped) {
			escaped = false;
			continue;
		}

		if (inString) {
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === inString) {
				inString = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			inString = char;
			continue;
		}

		if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0) {
				return { start: keyIndex, end: i + 1 };
			}
		}
	}

	return null;
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
	const configContent = await fs.readFile(configFilePath, "utf-8");
	const block = findNetworkBlock(configContent, chainId);

	if (!block) {
		console.warn(`  config.ts: no block for chainId ${chainId}, skipping config update`);
		return;
	}

	const blockText = configContent.slice(block.start, block.end);
	const gatewayImplLine = `\t\tgatewayImplementation: "${implementationAddress}",`;
	let updatedBlock: string;

	if (/^\s*gatewayImplementation:/m.test(blockText)) {
		updatedBlock = blockText.replace(
			/^\s*gatewayImplementation:.*$/m,
			gatewayImplLine,
		);
	} else {
		const closingBrace = blockText.lastIndexOf("}");
		updatedBlock =
			blockText.slice(0, closingBrace) +
			`\n${gatewayImplLine}\n` +
			blockText.slice(closingBrace);
	}

	const nextContent =
		configContent.slice(0, block.start) + updatedBlock + configContent.slice(block.end);

	await fs.writeFile(configFilePath, nextContent, "utf-8");
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
			`[${CHAIN_NAMES[chainId] ?? chainId}] fees ${tokenName}: senderToTreasury=${tokenConfig.senderToTreasury} providerToTreasury=${tokenConfig.providerToTreasury} tx=${receipt.hash}`,
		);
	}

	return txHashes;
}

async function executeUpgrade(
	chainId: number,
	provider: JsonRpcProvider,
	wallet: Wallet,
	base: UpgradeResult,
	proxy: string,
	proxyAdminAddress: string,
	options: UpgradeOptions,
): Promise<UpgradeResult> {
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

	let newImplementation: string;
	if (options.implementation) {
		newImplementation = getAddress(options.implementation);
		const code = await provider.getCode(newImplementation);
		if (!code || code === "0x") {
			return {
				...base,
				proxy,
				error: `No code at implementation ${newImplementation}`,
			};
		}
		chainLog(chainId, `using existing implementation ${newImplementation}`);
	} else {
		const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
		const implContract = await factory.deploy();
		const deployReceipt = await implContract.deploymentTransaction()?.wait();
		if (!deployReceipt || deployReceipt.status !== 1) {
			return {
				...base,
				proxy,
				error: `Gateway implementation deploy failed (tx status=${deployReceipt?.status ?? "unknown"})`,
			};
		}

		newImplementation = await implContract.getAddress();
		await waitForContractCode(provider, newImplementation, chainTag(chainId));
	}

	if (previousImplementation.toLowerCase() === newImplementation.toLowerCase()) {
		return {
			...base,
			proxy,
			newImplementation,
			error: "New implementation address equals current implementation",
		};
	}

	let upgradeTxHash = "";
	const currentImpl = await readStorageAddress(provider, proxy, IMPLEMENTATION_SLOT);
	if (currentImpl.toLowerCase() === newImplementation.toLowerCase()) {
		chainLog(chainId, `proxy already upgraded to ${newImplementation}`);
	} else if (currentImpl.toLowerCase() === previousImplementation.toLowerCase()) {
		const proxyAdmin = new Contract(proxyAdminAddress, PROXY_ADMIN_ABI, wallet);
		const upgradeTx = await proxyAdmin.upgrade(proxy, newImplementation);
		const upgradeReceipt = await upgradeTx.wait();
		upgradeTxHash = upgradeReceipt.hash;
		chainLog(chainId, `upgraded: impl ${newImplementation} tx ${upgradeTxHash}`);
	} else {
		chainLog(chainId, `proxy at ${currentImpl}, skipping upgrade to ${newImplementation}`);
	}

	const gateway = new Contract(proxy, artifact.abi, wallet);
	if (options.setFees) {
		base.feeTxHashes = await setTokenFeeSettings(wallet, gateway, chainId);
	}

	return {
		...base,
		proxy,
		newImplementation,
		upgradeTxHash,
		skipped: false,
	};
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

			chainLog(chainId, `[dry-run] would upgrade ${networkName} proxy ${proxy}`);
			chainLog(chainId, `[dry-run] current implementation ${snapshot.previousImplementation}`);
			chainLog(chainId, `[dry-run] proxy admin ${proxyAdminAddress}`);
			chainLog(chainId, `[dry-run] deployer balance ${snapshot.deployerBalance} native`);

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
			chainLog(chainId, `[dry-run] would upgrade ${networkName} proxy ${proxy}`);
			console.error(`[${networkName}] [dry-run] could not fetch on-chain state: ${message}`);
			return { ...base, proxy, skipped: true, error: message };
		}
	}

	if (proxyAdminAddress === ZERO_ADDRESS) {
		return { ...base, proxy, error: `Set proxyAdmin in config or PROXY_ADMIN_${chainId}` };
	}

	try {
		const { provider } = await connectRpcProvider(chainId, networkConfig.rpcUrl);
		try {
			const wallet = new Wallet(privateKey, provider);
			return await executeUpgrade(
				chainId,
				provider,
				wallet,
				base,
				proxy,
				proxyAdminAddress,
				options,
			);
		} finally {
			provider.destroy();
		}
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
	/** Optional per-chain implementation addresses (skip deploy when set). */
	implementations?: Record<number, string>;
}): Promise<UpgradeResult[]> {
	const chainIds = resolveTargetChainIds({ networks: params.networks });

	console.log(`\nUpgrading Gateway on ${chainIds.length} EVM network(s) in parallel...\n`);

	const results = await Promise.all(
		chainIds.map(async (chainId) => {
			const name = chainTag(chainId);
			console.log(`========== ${name} (${chainId}) ==========`);

			try {
				const result = await upgradeGatewayOnChain(chainId, params.privateKey, {
					dryRun: params.dryRun,
					setFees: params.setFees,
					updateConfig: false,
					implementation: params.implementations?.[chainId],
				});
				if (result.error && !params.dryRun) {
					console.error(`[${name}] failed: ${result.error}`);
				}
				return result;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`[${name}] failed: ${message}`);
				return {
					chainId,
					networkName: name,
					proxy: NETWORKS[chainId as keyof typeof NETWORKS]?.gatewayContract ?? "",
					previousImplementation: "",
					newImplementation: "",
					upgradeTxHash: "",
					feeTxHashes: [],
					skipped: false,
					error: message,
				};
			}
		}),
	);

	if (params.updateConfig && !params.dryRun) {
		for (const result of results) {
			if (!result.error && result.newImplementation) {
				await updateImplementationInConfig(result.chainId, result.newImplementation);
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
