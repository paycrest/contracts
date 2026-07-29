import {
	Contract,
	JsonRpcProvider,
	Network,
	Wallet,
	getAddress,
	formatEther,
	parseEther,
} from "ethers";
import { NETWORKS } from "./config";
import { rpcCandidates } from "./rpcUrls";
import { CHAIN_NAMES as BASE_CHAIN_NAMES } from "./gatewayUpgradeCore";

const CHAIN_NAMES: Record<number, string> = {
	...BASE_CHAIN_NAMES,
	10: "optimism",
	42420: "assetchain",
};

const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ZERO = "0x0000000000000000000000000000000000000000";

const GATEWAY_ABI = [
	"function owner() view returns (address)",
	"function pendingOwner() view returns (address)",
	"function transferOwnership(address newOwner)",
	"function acceptOwnership()",
];

const PROXY_ADMIN_ABI = [
	"function owner() view returns (address)",
	"function transferOwnership(address newOwner)",
];

/** Target native balances before ownership txs (includes buffer). */
export const GAS_TARGETS: Record<
	number,
	{ deployer: bigint; newOwner: bigint; fundOverhead: bigint }
> = {
	1: { deployer: parseEther("0.0005"), newOwner: parseEther("0.0003"), fundOverhead: parseEther("0.0002") },
	56: { deployer: parseEther("0.001"), newOwner: parseEther("0.0005"), fundOverhead: parseEther("0.0003") },
	137: { deployer: parseEther("0.055"), newOwner: parseEther("0.03"), fundOverhead: parseEther("0.02") },
	42161: { deployer: parseEther("0.0002"), newOwner: parseEther("0.0001"), fundOverhead: parseEther("0.0001") },
	8453: { deployer: parseEther("0.0002"), newOwner: parseEther("0.0001"), fundOverhead: parseEther("0.0001") },
	10: { deployer: parseEther("0.0002"), newOwner: parseEther("0.0001"), fundOverhead: parseEther("0.0001") },
	534352: { deployer: parseEther("0.0003"), newOwner: parseEther("0.00015"), fundOverhead: parseEther("0.0001") },
	42220: { deployer: parseEther("0.05"), newOwner: parseEther("0.025"), fundOverhead: parseEther("0.01") },
	1135: { deployer: parseEther("0.0002"), newOwner: parseEther("0.0001"), fundOverhead: parseEther("0.0001") },
};

/** EVM mainnets with a Gateway proxy (excludes Tron / AssetChain different owner). */
export const OWNERSHIP_CHAIN_IDS = [
	1, 56, 137, 42161, 8453, 10, 534352, 42220, 1135,
] as const;

export type OwnershipTransferResult = {
	chainId: number;
	networkName: string;
	gateway: string;
	proxyAdmin: string;
	gatewayOwnerBefore: string;
	proxyAdminOwnerBefore: string;
	gatewayOwnerAfter?: string;
	fundDeployerTxHash?: string;
	fundNewOwnerTxHash?: string;
	gatewayTxHash?: string;
	gatewayAcceptTxHash?: string;
	proxyAdminTxHash?: string;
	gatewayPendingOwner?: string;
	skipped: boolean;
	error?: string;
};

export type OwnershipTransferOptions = {
	privateKey: string;
	newOwner: string;
	newOwnerPrivateKey?: string;
	/** FUND_ACCOUNT key — tops up deployer/new owner when short on gas. */
	fundPrivateKey?: string;
	dryRun?: boolean;
	transferGateway?: boolean;
	transferProxyAdmin?: boolean;
	networks?: string;
	/** Run all chains concurrently (default true). */
	parallel?: boolean;
};

const RPC_PROBE_TIMEOUT_MS = Number(process.env.RPC_PROBE_TIMEOUT_MS ?? 15_000);
const RPC_OPERATION_TIMEOUT_MS = Number(process.env.RPC_OPERATION_TIMEOUT_MS ?? 300_000);

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	}
}

function tag(chainId: number): string {
	return CHAIN_NAMES[chainId] ?? String(chainId);
}

function createProvider(rpcUrl: string, chainId: number): JsonRpcProvider {
	const network = Network.from(chainId);
	return new JsonRpcProvider(rpcUrl, network, { staticNetwork: network, batchMaxCount: 1 });
}

async function connectRpc(
	chainId: number,
	configuredUrl: string,
): Promise<{ provider: JsonRpcProvider; rpcUrl: string }> {
	const candidates = rpcCandidates(chainId, configuredUrl);
	let lastError: Error | undefined;
	for (const rpcUrl of candidates) {
		const provider = createProvider(rpcUrl, chainId);
		try {
			await withTimeout(provider.getBlockNumber(), RPC_PROBE_TIMEOUT_MS, `rpc probe ${rpcUrl}`);
			return { provider, rpcUrl };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			provider.destroy();
		}
	}
	throw lastError ?? new Error("No RPC endpoint available");
}

function storageAddress(slotValue: string): string {
	const hex = slotValue.replace("0x", "").padStart(64, "0");
	return getAddress("0x" + hex.slice(-40));
}

async function resolveProxyAdmin(
	provider: JsonRpcProvider,
	chainId: number,
	gateway: string,
): Promise<string> {
	const envOverride = process.env[`PROXY_ADMIN_${chainId}`];
	if (envOverride) return getAddress(envOverride);

	const fromConfig = NETWORKS[chainId as keyof typeof NETWORKS]?.proxyAdmin;
	if (fromConfig) return getAddress(fromConfig);

	const raw = await provider.getStorage(gateway, ADMIN_SLOT);
	const admin = storageAddress(raw);
	if (admin === ZERO) {
		throw new Error("Could not resolve ProxyAdmin (config missing and ERC1967 admin slot empty)");
	}
	return admin;
}

export function resolveChainIds(networksFilter?: string): number[] {
	let ids = [...OWNERSHIP_CHAIN_IDS].filter((chainId) => {
		const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
		return Boolean(cfg?.gatewayContract && cfg.gatewayContract.startsWith("0x"));
	});

	if (networksFilter?.trim()) {
		const tokens = networksFilter.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
		ids = ids.filter((chainId) => {
			const name = (CHAIN_NAMES[chainId] ?? "").toLowerCase();
			return tokens.includes(String(chainId)) || tokens.includes(name);
		});
	}
	return ids;
}

async function fundIfNeeded(
	provider: JsonRpcProvider,
	networkName: string,
	fundKey: string,
	to: string,
	target: bigint,
	label: string,
): Promise<string | undefined> {
	const bal = await provider.getBalance(to);
	if (bal >= target) {
		console.log(`[${networkName}] ${label} funded enough (${formatEther(bal)}) — skip top-up`);
		return undefined;
	}

	const shortfall = target - bal;
	const fundWallet = new Wallet(fundKey.startsWith("0x") ? fundKey : `0x${fundKey}`, provider);
	const fundBal = await provider.getBalance(fundWallet.address);
	if (fundBal < shortfall) {
		throw new Error(
			`FUND_ACCOUNT ${fundWallet.address} has ${formatEther(fundBal)}, need ${formatEther(shortfall)} to top up ${label}`,
		);
	}

	console.log(
		`[${networkName}] funding ${label} ${to} +${formatEther(shortfall)} (have ${formatEther(bal)}, target ${formatEther(target)})`,
	);
	const tx = await fundWallet.sendTransaction({ to, value: shortfall });
	console.log(`[${networkName}] fund ${label} tx=${tx.hash}`);
	await tx.wait();
	return tx.hash;
}

async function transferOnChain(
	chainId: number,
	privateKey: string,
	newOwner: string,
	opts: {
		dryRun: boolean;
		transferGateway: boolean;
		transferProxyAdmin: boolean;
		newOwnerPrivateKey?: string;
		fundPrivateKey?: string;
	},
): Promise<OwnershipTransferResult> {
	const networkName = tag(chainId);
	const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];
	const gateway = getAddress(networkConfig!.gatewayContract!);
	const gasTarget = GAS_TARGETS[chainId];

	const base: OwnershipTransferResult = {
		chainId,
		networkName,
		gateway,
		proxyAdmin: ZERO,
		gatewayOwnerBefore: ZERO,
		proxyAdminOwnerBefore: ZERO,
		skipped: false,
	};

	const { provider } = await connectRpc(chainId, networkConfig?.rpcUrl ?? "");
	try {
		return await withTimeout(
			(async () => {
				const wallet = new Wallet(privateKey, provider);
				const proxyAdminAddr = await resolveProxyAdmin(provider, chainId, gateway);
				base.proxyAdmin = proxyAdminAddr;

				const gatewayAsOwner = new Contract(gateway, GATEWAY_ABI, wallet);
				const proxyAdmin = new Contract(proxyAdminAddr, PROXY_ADMIN_ABI, wallet);

				const gatewayOwner = getAddress(await gatewayAsOwner.owner());
				const proxyAdminOwner = getAddress(await proxyAdmin.owner());
				base.gatewayOwnerBefore = gatewayOwner;
				base.proxyAdminOwnerBefore = proxyAdminOwner;

				let pendingOwner = getAddress(await gatewayAsOwner.pendingOwner());

				console.log(`[${networkName}] gateway owner=${gatewayOwner} pending=${pendingOwner}`);
				console.log(`[${networkName}] proxyAdmin=${proxyAdminAddr} owner=${proxyAdminOwner}`);

				// Pre-check: skip early if FUND cannot cover required top-ups
				if (opts.fundPrivateKey && gasTarget && !opts.dryRun) {
					const fundWallet = new Wallet(
						opts.fundPrivateKey.startsWith("0x") ? opts.fundPrivateKey : `0x${opts.fundPrivateKey}`,
					);
					const [depBal, newBal, fundBal] = await Promise.all([
						provider.getBalance(wallet.address),
						provider.getBalance(newOwner),
						provider.getBalance(fundWallet.address),
					]);
					const depNeed = depBal < gasTarget.deployer ? gasTarget.deployer - depBal : 0n;
					const newNeed = newBal < gasTarget.newOwner ? gasTarget.newOwner - newBal : 0n;
					const required = depNeed + newNeed + (depNeed + newNeed > 0n ? gasTarget.fundOverhead : 0n);
					if (required > 0n && fundBal < required) {
						throw new Error(
							`FUND_ACCOUNT insufficient: have ${formatEther(fundBal)}, need ~${formatEther(required)} — skipping chain`,
						);
					}
				}

				if (opts.dryRun) {
					base.skipped = true;
					console.log(
						`[${networkName}] [dry-run] fund(if needed) → transferOwnership → acceptOwnership → ProxyAdmin`,
					);
					return base;
				}

				// 1) Gas top-ups from FUND_ACCOUNT (only if short)
				if (opts.fundPrivateKey && gasTarget) {
					base.fundDeployerTxHash = await fundIfNeeded(
						provider,
						networkName,
						opts.fundPrivateKey,
						wallet.address,
						gasTarget.deployer,
						"deployer",
					);
					base.fundNewOwnerTxHash = await fundIfNeeded(
						provider,
						networkName,
						opts.fundPrivateKey,
						newOwner,
						gasTarget.newOwner,
						"newOwner",
					);
				}

				// 2) Gateway Ownable2Step: transfer + accept
				if (opts.transferGateway) {
					const alreadyOwned = gatewayOwner.toLowerCase() === newOwner.toLowerCase();
					if (alreadyOwned) {
						console.log(`[${networkName}] Gateway already owned by new owner — skip`);
						base.gatewayOwnerAfter = gatewayOwner;
					} else {
						const canPropose = gatewayOwner.toLowerCase() === wallet.address.toLowerCase();
						const pendingIsNew = pendingOwner.toLowerCase() === newOwner.toLowerCase();

						if (!canPropose && !pendingIsNew) {
							throw new Error(
								`Deployer is not Gateway owner (owner=${gatewayOwner}, deployer=${wallet.address})`,
							);
						}

						if (canPropose && !pendingIsNew) {
							const tx = await gatewayAsOwner.transferOwnership(newOwner);
							console.log(`[${networkName}] Gateway transferOwnership tx=${tx.hash}`);
							await tx.wait();
							base.gatewayTxHash = tx.hash;
							pendingOwner = getAddress(await gatewayAsOwner.pendingOwner());
						} else {
							console.log(
								`[${networkName}] Gateway pendingOwner already ${pendingOwner} — accept only`,
							);
						}

						base.gatewayPendingOwner = pendingOwner;

						if (!opts.newOwnerPrivateKey) {
							throw new Error(
								"NEW_OWNER_PRIVATE_KEY required to accept Gateway ownership immediately",
							);
						}

						const newOwnerWallet = new Wallet(opts.newOwnerPrivateKey, provider);
						if (newOwnerWallet.address.toLowerCase() !== newOwner.toLowerCase()) {
							throw new Error(
								`NEW_OWNER_PRIVATE_KEY derives ${newOwnerWallet.address}, expected ${newOwner}`,
							);
						}

						const gatewayAsNewOwner = new Contract(gateway, GATEWAY_ABI, newOwnerWallet);
						const acceptTx = await gatewayAsNewOwner.acceptOwnership();
						console.log(`[${networkName}] Gateway acceptOwnership tx=${acceptTx.hash}`);
						await acceptTx.wait();
						base.gatewayAcceptTxHash = acceptTx.hash;
						base.gatewayOwnerAfter = getAddress(await gatewayAsNewOwner.owner());
						base.gatewayPendingOwner = getAddress(await gatewayAsNewOwner.pendingOwner());
						console.log(`[${networkName}] Gateway owner now ${base.gatewayOwnerAfter}`);
					}
				}

				// 3) ProxyAdmin (single-step)
				if (opts.transferProxyAdmin) {
					if (proxyAdminOwner.toLowerCase() !== wallet.address.toLowerCase()) {
						throw new Error(
							`Deployer is not ProxyAdmin owner (owner=${proxyAdminOwner}, deployer=${wallet.address})`,
						);
					}
					if (proxyAdminOwner.toLowerCase() === newOwner.toLowerCase()) {
						console.log(`[${networkName}] ProxyAdmin already owned by new owner — skip`);
					} else {
						const tx = await proxyAdmin.transferOwnership(newOwner);
						console.log(`[${networkName}] ProxyAdmin transferOwnership tx=${tx.hash}`);
						await tx.wait();
						base.proxyAdminTxHash = tx.hash;
					}
				}

				return base;
			})(),
			RPC_OPERATION_TIMEOUT_MS,
			`ownership transfer chain ${chainId}`,
		);
	} finally {
		provider.destroy();
	}
}

export async function transferOwnershipAllEvm(
	options: OwnershipTransferOptions,
): Promise<OwnershipTransferResult[]> {
	const newOwner = getAddress(options.newOwner);
	const dryRun = Boolean(options.dryRun);
	const transferGateway = options.transferGateway !== false;
	const transferProxyAdmin = options.transferProxyAdmin !== false;
	const parallel = options.parallel !== false;
	const chainIds = resolveChainIds(options.networks);

	if (!dryRun && transferGateway && !options.newOwnerPrivateKey) {
		throw new Error(
			"Set NEW_OWNER_PRIVATE_KEY so Gateway acceptOwnership can complete immediately after transferOwnership",
		);
	}

	if (!dryRun && options.newOwnerPrivateKey) {
		const derived = new Wallet(options.newOwnerPrivateKey).address;
		if (derived.toLowerCase() !== newOwner.toLowerCase()) {
			throw new Error(
				`NEW_OWNER_PRIVATE_KEY derives ${derived}, but --new-owner is ${newOwner}`,
			);
		}
	}

	if (options.fundPrivateKey) {
		const fundAddr = new Wallet(
			options.fundPrivateKey.startsWith("0x")
				? options.fundPrivateKey
				: `0x${options.fundPrivateKey}`,
		).address;
		console.log(`\nFUND_ACCOUNT: ${fundAddr} (tops up gas when short)`);
	}

	console.log(
		`\nRunning ${chainIds.length} chain(s) ${parallel ? "in parallel" : "sequentially"}: ${chainIds
			.map(tag)
			.join(", ")}\n`,
	);

	const runOne = async (chainId: number): Promise<OwnershipTransferResult> => {
		try {
			return await transferOnChain(chainId, options.privateKey, newOwner, {
				dryRun,
				transferGateway,
				transferProxyAdmin,
				newOwnerPrivateKey: options.newOwnerPrivateKey,
				fundPrivateKey: options.fundPrivateKey,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[${tag(chainId)}] FAILED: ${message}`);
			return {
				chainId,
				networkName: tag(chainId),
				gateway: NETWORKS[chainId as keyof typeof NETWORKS]?.gatewayContract ?? "",
				proxyAdmin: "",
				gatewayOwnerBefore: "",
				proxyAdminOwnerBefore: "",
				skipped: false,
				error: message,
			};
		}
	};

	if (parallel) {
		return Promise.all(chainIds.map(runOne));
	}

	const results: OwnershipTransferResult[] = [];
	for (const chainId of chainIds) {
		results.push(await runOne(chainId));
	}
	return results;
}

export function printOwnershipSummary(results: OwnershipTransferResult[], dryRun: boolean) {
	console.log(`\n${dryRun ? "Dry-run" : "Transfer"} summary`);
	console.table(
		results.map((r) => ({
			network: r.networkName,
			ownerBefore: r.gatewayOwnerBefore || "-",
			ownerAfter: r.gatewayOwnerAfter ?? "-",
			fundDep: r.fundDeployerTxHash ?? "-",
			fundNew: r.fundNewOwnerTxHash ?? "-",
			transferTx: r.gatewayTxHash ?? (r.skipped ? "dry-run" : "-"),
			acceptTx: r.gatewayAcceptTxHash ?? (r.skipped ? "dry-run" : "-"),
			proxyAdminTx: r.proxyAdminTxHash ?? (r.skipped ? "dry-run" : "-"),
			error: r.error ?? "",
		})),
	);

	if (!dryRun) {
		console.log("\nPer chain: fund(if short) → Gateway.transferOwnership → acceptOwnership → ProxyAdmin.transferOwnership");
		console.log("Chains with insufficient FUND_ACCOUNT balance are reported as FAILED/skipped.");
	}
}
