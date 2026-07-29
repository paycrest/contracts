/**
 * Dry-run cost estimate: deploy new Gateway implementation + ProxyAdmin.upgrade
 * on each configured EVM mainnet.
 *
 * Usage:
 *   npx hardhat run scripts/estimateGatewayUpgradeCost.ts --network hardhat
 *
 * Prefers NEW_OWNER_PRIVATE_KEY (ProxyAdmin owner / upgrade signer), else DEPLOYER_PRIVATE_KEY.
 * Set ESTIMATE_KEY=deployer|newOwner to force which key is used for balance checks.
 */
import "dotenv/config";
import {
	Contract,
	ContractFactory,
	formatEther,
	JsonRpcProvider,
	Network,
	Wallet,
	getAddress,
	parseEther,
} from "ethers";
import { NETWORKS } from "./config";
import {
	CHAIN_NAMES,
	EVM_MAINNET_CHAIN_IDS,
	resolveTargetChainIds,
} from "./gatewayUpgradeCore";
import { rpcCandidates } from "./rpcUrls";
import { readFileSync } from "fs";
import path from "path";

const IMPLEMENTATION_SLOT =
	"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PROXY_ADMIN_ABI = [
	"function owner() view returns (address)",
	"function upgrade(address proxy, address implementation)",
	"function getProxyImplementation(address proxy) view returns (address)",
];

/** Conservative native buffer on top of estimated deploy+upgrade (covers fee spikes / retries). */
const BUFFER: Record<number, bigint> = {
	1: parseEther("0.002"),
	56: parseEther("0.003"),
	137: parseEther("0.08"),
	42161: parseEther("0.0005"),
	8453: parseEther("0.0005"),
	534352: parseEther("0.0008"),
	42220: parseEther("0.08"),
	1135: parseEther("0.0005"),
};

function loadGatewayArtifact() {
	const p = path.join(process.cwd(), "artifacts/contracts/Gateway.sol/Gateway.json");
	return JSON.parse(readFileSync(p, "utf-8")) as { abi: any[]; bytecode: string };
}

function pickKey(): { label: string; pk: string; address: string } {
	const prefer = (process.env.ESTIMATE_KEY || "newOwner").toLowerCase();
	const newOwner = process.env.NEW_OWNER_PRIVATE_KEY?.trim();
	const deployer = process.env.DEPLOYER_PRIVATE_KEY?.trim();

	const use =
		prefer === "deployer"
			? deployer || newOwner
			: newOwner || deployer;
	if (!use) {
		throw new Error("Set NEW_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
	}
	const label =
		prefer === "deployer" && deployer
			? "DEPLOYER"
			: newOwner && use === newOwner
				? "NEW_OWNER"
				: deployer
					? "DEPLOYER"
					: "NEW_OWNER";
	const pk = use.startsWith("0x") ? use : `0x${use}`;
	return { label, pk, address: new Wallet(pk).address };
}

async function connect(chainId: number, rpcUrl: string): Promise<JsonRpcProvider> {
	return new JsonRpcProvider(rpcUrl, Network.from(chainId), {
		staticNetwork: Network.from(chainId),
	});
}

async function withFirstRpc<T>(
	chainId: number,
	fn: (provider: JsonRpcProvider) => Promise<T>,
): Promise<T> {
	const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
	const urls = rpcCandidates(chainId, cfg?.rpcUrl);
	let lastErr: unknown;
	for (const url of urls) {
		const provider = await connect(chainId, url);
		try {
			await provider.getBlockNumber();
			return await fn(provider);
		} catch (e) {
			lastErr = e;
			provider.destroy();
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function estimateOne(chainId: number, signerKey: string, signerAddress: string) {
	const name = CHAIN_NAMES[chainId] ?? String(chainId);
	const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
	const proxy = cfg?.gatewayContract;
	if (!proxy) {
		return { chainId, name, error: "no gatewayContract" };
	}

	const artifact = loadGatewayArtifact();
	const proxyAdmin =
		(cfg as { proxyAdmin?: string }).proxyAdmin ||
		process.env[`PROXY_ADMIN_${chainId}`] ||
		"";

	return withFirstRpc(chainId, async (provider) => {
		try {
			const wallet = new Wallet(signerKey, provider);
			const balance = await provider.getBalance(wallet.address);
			const fee = await provider.getFeeData();
			const gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 0n;
			const maxFee = fee.maxFeePerGas ?? gasPrice;

			const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
			const deployTx = await factory.getDeployTransaction();
			const deployGas = await provider.estimateGas({
				...deployTx,
				from: wallet.address,
			});

			// Upgrade estimate needs a plausible impl address with code; use current impl
			// as placeholder for calldata sizing (gas is dominated by admin path, not bytecode).
			let currentImpl = "";
			try {
				const slot = await provider.getStorage(proxy, IMPLEMENTATION_SLOT);
				currentImpl = getAddress(`0x${slot.slice(-40)}`);
			} catch {
				currentImpl = wallet.address;
			}

			let upgradeGas = 80_000n;
			let adminOwner = "";
			if (proxyAdmin && proxyAdmin !== "0x0000000000000000000000000000000000000000") {
				const admin = new Contract(proxyAdmin, PROXY_ADMIN_ABI, wallet);
				try {
					adminOwner = getAddress(await admin.owner());
				} catch {
					/* ignore */
				}
				try {
					upgradeGas = await admin.upgrade.estimateGas(proxy, currentImpl);
				} catch {
					// Some admins revert if same impl; use typical observed ~40–90k
					upgradeGas = 90_000n;
				}
			} else {
				return {
					chainId,
					name,
					proxy,
					error: "missing proxyAdmin in config",
				};
			}

			const totalGas = deployGas + upgradeGas;
			const estWei = totalGas * maxFee;
			const buffer = BUFFER[chainId] ?? parseEther("0.001");
			const recommended = estWei + buffer;
			const shortfall = balance >= recommended ? 0n : recommended - balance;

			return {
				chainId,
				name,
				proxy,
				proxyAdmin: proxyAdmin || "-",
				adminOwner: adminOwner || "-",
				signerIsAdminOwner: adminOwner
					? getAddress(adminOwner) === getAddress(signerAddress)
					: "unknown",
				balance: formatEther(balance),
				deployGas: deployGas.toString(),
				upgradeGas: upgradeGas.toString(),
				maxFeeGwei: Number(maxFee) / 1e9,
				estNative: formatEther(estWei),
				bufferNative: formatEther(buffer),
				recommendedNative: formatEther(recommended),
				shortfallNative: formatEther(shortfall),
				ok: shortfall === 0n,
			};
		} finally {
			provider.destroy();
		}
	});
}

async function main() {
	const { label, pk, address } = pickKey();
	const networks = process.env.NETWORKS?.trim();
	const chainIds = resolveTargetChainIds({ networks });

	console.log(`\nGateway upgrade cost dry-run`);
	console.log(`Signer: ${label} ${address}`);
	console.log(`Chains: ${chainIds.map((id) => CHAIN_NAMES[id] ?? id).join(", ")}`);
	console.log(`(deploy implementation + ProxyAdmin.upgrade; buffer included)\n`);

	const rows = [];
	for (const chainId of chainIds) {
		process.stdout.write(`[${CHAIN_NAMES[chainId] ?? chainId}] estimating...\n`);
		try {
			rows.push(await estimateOne(chainId, pk, address));
		} catch (e) {
			rows.push({
				chainId,
				name: CHAIN_NAMES[chainId] ?? String(chainId),
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	console.log("\n========== Per-chain funding need ==========");
	console.table(
		rows.map((r: any) =>
			r.error
				? { network: r.name, chainId: r.chainId, status: "FAIL", error: r.error.slice(0, 80) }
				: {
						network: r.name,
						chainId: r.chainId,
						balance: r.balance,
						est: r.estNative,
						buffer: r.bufferNative,
						need: r.recommendedNative,
						short: r.shortfallNative,
						adminOK: r.signerIsAdminOwner,
						funded: r.ok ? "YES" : "NO",
					},
		),
	);

	const ok = rows.filter((r: any) => r.ok);
	const short = rows.filter((r: any) => !r.error && !r.ok);
	const failed = rows.filter((r: any) => r.error);

	console.log(`\nFunded enough: ${ok.length} | Short: ${short.length} | Estimate failed: ${failed.length}`);
	if (short.length) {
		console.log("\nTop up (recommended native, includes buffer):");
		for (const r of short as any[]) {
			console.log(`  ${r.name}: send ~${r.shortfallNative} to ${address} (target ~${r.recommendedNative})`);
		}
	}
	console.log(
		"\nNote: upgrade tx must be signed by ProxyAdmin.owner (adminOK). Deploy can be any funded key; this script funds the chosen signer for both steps.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
