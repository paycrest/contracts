/**
 * Preflight blockers for transfer-ownership-all-evm (no secret material printed).
 * Usage: npx hardhat run scripts/preflightOwnershipTransfer.ts
 */
import { Contract, JsonRpcProvider, Network, Wallet, formatEther, getAddress } from "ethers";
import { NETWORKS } from "./config";
import { rpcCandidates } from "./rpcUrls";
import { GAS_TARGETS, OWNERSHIP_CHAIN_IDS } from "./transferOwnershipAllEvm";
import { CHAIN_NAMES as BASE } from "./gatewayUpgradeCore";

const CHAIN_NAMES: Record<number, string> = { ...BASE, 10: "optimism" };
const NEW_OWNER = "0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD";
const READY = ["bsc", "polygon", "arbitrum", "base", "scroll", "celo", "lisk"];

const GATEWAY_ABI = [
	"function owner() view returns (address)",
	"function pendingOwner() view returns (address)",
];
const PROXY_ADMIN_ABI = ["function owner() view returns (address)"];
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const ZERO = "0x0000000000000000000000000000000000000000";

function storageAddress(slotValue: string): string {
	const hex = slotValue.replace("0x", "").padStart(64, "0");
	return getAddress("0x" + hex.slice(-40));
}

async function connect(chainId: number, configuredUrl: string) {
	for (const url of rpcCandidates(chainId, configuredUrl)) {
		try {
			const network = Network.from(chainId);
			const provider = new JsonRpcProvider(url, network, {
				staticNetwork: network,
				batchMaxCount: 1,
			});
			await Promise.race([
				provider.getBlockNumber(),
				new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12_000)),
			]);
			return provider;
		} catch {
			/* try next */
		}
	}
	throw new Error("no rpc");
}

async function main() {
	const blockers: string[] = [];
	const warnings: string[] = [];

	const hasDeployer = Boolean(process.env.DEPLOYER_PRIVATE_KEY?.trim());
	const hasNewOwnerKey = Boolean(process.env.NEW_OWNER_PRIVATE_KEY?.trim());
	const hasFund = Boolean(process.env.FUND_ACCOUNT?.trim());

	console.log("=== Env presence (booleans only) ===");
	console.log(`DEPLOYER_PRIVATE_KEY: ${hasDeployer ? "SET" : "MISSING"}`);
	console.log(`NEW_OWNER_PRIVATE_KEY: ${hasNewOwnerKey ? "SET" : "MISSING"}`);
	console.log(`FUND_ACCOUNT: ${hasFund ? "SET" : "MISSING"}`);

	if (!hasDeployer) blockers.push("DEPLOYER_PRIVATE_KEY missing");
	if (!hasNewOwnerKey) blockers.push("NEW_OWNER_PRIVATE_KEY missing (required for acceptOwnership)");
	if (!hasFund) warnings.push("FUND_ACCOUNT missing — gas top-ups will not run");

	let deployerAddr = "";
	let fundAddr = "";
	if (hasDeployer) {
		deployerAddr = new Wallet(process.env.DEPLOYER_PRIVATE_KEY!).address;
		console.log(`\nDeployer address: ${deployerAddr}`);
	}
	if (hasFund) {
		const k = process.env.FUND_ACCOUNT!;
		fundAddr = new Wallet(k.startsWith("0x") ? k : `0x${k}`).address;
		console.log(`FUND_ACCOUNT address: ${fundAddr}`);
	}
	console.log(`Target new owner: ${NEW_OWNER}`);

	if (hasNewOwnerKey) {
		const derived = new Wallet(process.env.NEW_OWNER_PRIVATE_KEY!).address;
		if (derived.toLowerCase() !== NEW_OWNER.toLowerCase()) {
			blockers.push(
				`NEW_OWNER_PRIVATE_KEY derives ${derived}, expected ${NEW_OWNER}`,
			);
		} else {
			console.log("NEW_OWNER_PRIVATE_KEY matches target address: OK");
		}
	}

	const chainIds = OWNERSHIP_CHAIN_IDS.filter((id) =>
		READY.includes((CHAIN_NAMES[id] ?? "").toLowerCase()),
	);

	console.log("\n=== Per-chain checks (ready set) ===");

	await Promise.all(
		chainIds.map(async (chainId) => {
			const name = CHAIN_NAMES[chainId] ?? String(chainId);
			const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
			const issues: string[] = [];
			try {
				const provider = await connect(chainId, cfg?.rpcUrl ?? "");
				const gateway = getAddress(cfg!.gatewayContract!);
				const proxyAdmin =
					(cfg as { proxyAdmin?: string }).proxyAdmin ??
					storageAddress(await provider.getStorage(gateway, ADMIN_SLOT));

				const gw = new Contract(gateway, GATEWAY_ABI, provider);
				const [gwOwner, pending] = await Promise.all([gw.owner(), gw.pendingOwner()]);

				if (deployerAddr && gwOwner.toLowerCase() !== deployerAddr.toLowerCase()) {
					issues.push(`Gateway owner ${gwOwner} != deployer`);
				}
				if (pending !== ZERO) {
					warnings.push(`${name}: pendingOwner already ${pending}`);
				}

				if (proxyAdmin === ZERO) {
					issues.push("ProxyAdmin unresolved");
				} else {
					const pa = new Contract(proxyAdmin, PROXY_ADMIN_ABI, provider);
					const paOwner = await pa.owner();
					if (deployerAddr && paOwner.toLowerCase() !== deployerAddr.toLowerCase()) {
						issues.push(`ProxyAdmin owner ${paOwner} != deployer`);
					}
				}

				const targets = GAS_TARGETS[chainId];
				if (fundAddr && targets && deployerAddr) {
					const [depBal, newBal, fundBal] = await Promise.all([
						provider.getBalance(deployerAddr),
						provider.getBalance(NEW_OWNER),
						provider.getBalance(fundAddr),
					]);
					const depNeed = depBal < targets.deployer ? targets.deployer - depBal : 0n;
					const newNeed = newBal < targets.newOwner ? targets.newOwner - newBal : 0n;
					const required =
						depNeed + newNeed + (depNeed + newNeed > 0n ? targets.fundOverhead : 0n);
					if (required > 0n && fundBal < required) {
						issues.push(
							`FUND short: have ${formatEther(fundBal)}, need ~${formatEther(required)}`,
						);
					}
				}

				provider.destroy();
				const status = issues.length ? "BLOCKED" : "OK";
				console.log(
					`${name.padEnd(12)} ${status}${issues.length ? " — " + issues.join("; ") : ""}`,
				);
				for (const i of issues) blockers.push(`${name}: ${i}`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.log(`${name.padEnd(12)} BLOCKED — RPC/error: ${msg}`);
				blockers.push(`${name}: ${msg}`);
			}
		}),
	);

	console.log("\n=== Also note (out of ready set) ===");
	console.log("Chains outside READY were not checked in this run; fund/ownership may still block them.");

	console.log("\n=== BLOCKERS ===");
	if (!blockers.length) console.log("(none)");
	else blockers.forEach((b) => console.log(`- ${b}`));

	console.log("\n=== WARNINGS ===");
	if (!warnings.length) console.log("(none)");
	else warnings.forEach((w) => console.log(`- ${w}`));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
