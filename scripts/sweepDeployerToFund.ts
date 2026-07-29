/**
 * Sweep leftover native gas from DEPLOYER back to FUND_ACCOUNT
 * on chains where Gateway ownership already moved to NEW_OWNER.
 *
 * Usage: npx hardhat run scripts/sweepDeployerToFund.ts
 */
import {
	JsonRpcProvider,
	Network,
	Wallet,
	formatEther,
	parseEther,
	getAddress,
} from "ethers";
import { NETWORKS } from "./config";
import { rpcCandidates } from "./rpcUrls";

const NEW_OWNER = "0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD";

const CHAINS: Array<{ id: number; name: string }> = [
	{ id: 42161, name: "arbitrum" },
	{ id: 8453, name: "base" },
	{ id: 534352, name: "scroll" },
	{ id: 1135, name: "lisk" },
];

const GATEWAY_ABI = ["function owner() view returns (address)"];

async function connect(chainId: number, configuredUrl: string) {
	let last: unknown;
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
		} catch (e) {
			last = e;
		}
	}
	throw last ?? new Error("no rpc");
}

async function sweepOne(
	chainId: number,
	name: string,
	deployerKey: string,
	fundAddress: string,
): Promise<void> {
	const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
	const provider = await connect(chainId, cfg?.rpcUrl ?? "");
	try {
		const deployer = new Wallet(deployerKey, provider);
		const gateway = getAddress(cfg!.gatewayContract!);
		const { Contract } = await import("ethers");
		const owner = (
			await new Contract(gateway, GATEWAY_ABI, provider).owner()
		).toLowerCase();

		if (owner !== NEW_OWNER.toLowerCase()) {
			console.log(
				`[${name}] SKIP — Gateway owner is ${owner}, expected new owner (ownership not transferred)`,
			);
			return;
		}

		const bal = await provider.getBalance(deployer.address);
		if (bal === 0n) {
			console.log(`[${name}] SKIP — deployer balance is 0`);
			return;
		}

		// L2s charge L1 data fees; leave a conservative reserve instead of
		// under-estimating with gasLimit*maxFee alone.
		const RESERVE: Record<string, bigint> = {
			polygon: parseEther("0.02"),
			arbitrum: parseEther("0.00008"),
			base: parseEther("0.00008"),
			scroll: parseEther("0.00015"),
			celo: parseEther("0.02"),
			lisk: parseEther("0.00008"),
		};
		const reserve = RESERVE[name] ?? parseEther("0.0001");
		if (bal <= reserve) {
			console.log(
				`[${name}] SKIP — balance ${formatEther(bal)} ≤ reserve ${formatEther(reserve)}`,
			);
			return;
		}

		const value = bal - reserve;
		const feeData = await provider.getFeeData();
		const txRequest: {
			to: string;
			value: bigint;
			gasLimit: bigint;
			maxFeePerGas?: bigint;
			maxPriorityFeePerGas?: bigint;
			gasPrice?: bigint;
		} = {
			to: fundAddress,
			value,
			gasLimit: 30_000n,
		};
		if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
			txRequest.maxFeePerGas = feeData.maxFeePerGas * 2n;
			txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * 2n;
		} else if (feeData.gasPrice) {
			txRequest.gasPrice = feeData.gasPrice * 2n;
		}

		console.log(
			`[${name}] sweeping ${formatEther(value)} → ${fundAddress} (reserve ${formatEther(reserve)})`,
		);

		const tx = await deployer.sendTransaction(txRequest);
		console.log(`[${name}] tx=${tx.hash}`);
		await tx.wait();
		const left = await provider.getBalance(deployer.address);
		console.log(`[${name}] DONE — deployer left ${formatEther(left)}`);
	} finally {
		provider.destroy();
	}
}

async function main() {
	const deployerKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
	const fundKey = process.env.FUND_ACCOUNT?.trim();
	if (!deployerKey) throw new Error("Set DEPLOYER_PRIVATE_KEY");
	if (!fundKey) throw new Error("Set FUND_ACCOUNT");

	const fundAddress = new Wallet(
		fundKey.startsWith("0x") ? fundKey : `0x${fundKey}`,
	).address;
	const deployerAddress = new Wallet(deployerKey).address;

	console.log(`Sweep deployer ${deployerAddress} → FUND ${fundAddress}`);
	console.log(`Chains: ${CHAINS.map((c) => c.name).join(", ")}\n`);

	const results = await Promise.all(
		CHAINS.map(async (c) => {
			try {
				await sweepOne(c.id, c.name, deployerKey, fundAddress);
				return { network: c.name, ok: true };
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error(`[${c.name}] FAILED: ${msg}`);
				return { network: c.name, ok: false, error: msg };
			}
		}),
	);

	const failed = results.filter((r) => !r.ok);
	if (failed.length) {
		throw new Error(`Sweep failed on: ${failed.map((f) => f.network).join(", ")}`);
	}
	console.log("\nAll sweeps complete.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
