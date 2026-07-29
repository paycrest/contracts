import { Wallet, JsonRpcProvider, Network, formatEther, parseEther } from "ethers";

/**
 * Read-only: derive FUND_ACCOUNT address and compare native balances
 * vs funding needs for deployer + new owner across EVM mainnets.
 *
 * Usage: npx hardhat run scripts/checkFundAccount.ts
 */
async function main() {
	const fundKey = process.env.FUND_ACCOUNT?.trim();
	if (!fundKey) {
		throw new Error("FUND_ACCOUNT is not set");
	}

	const fundWallet = new Wallet(fundKey.startsWith("0x") ? fundKey : `0x${fundKey}`);
	const FUND = fundWallet.address;
	const DEPLOYER = "0xEaAeBeB57dC88fD25aDEe72711538aF0c6a9AC6E";
	const NEW_OWNER = "0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD";

	const NEED: Record<string, { symbol: string; deployer: bigint; newOwner: bigint }> = {
		ethereum: { symbol: "ETH", deployer: parseEther("0.002"), newOwner: parseEther("0.001") },
		bsc: { symbol: "BNB", deployer: parseEther("0.001"), newOwner: parseEther("0.0005") },
		polygon: { symbol: "POL", deployer: parseEther("0.055"), newOwner: parseEther("0.03") },
		arbitrum: { symbol: "ETH", deployer: parseEther("0.0002"), newOwner: parseEther("0.0001") },
		base: { symbol: "ETH", deployer: parseEther("0.0002"), newOwner: parseEther("0.0001") },
		optimism: { symbol: "ETH", deployer: parseEther("0.0002"), newOwner: parseEther("0.0001") },
		scroll: { symbol: "ETH", deployer: parseEther("0.0003"), newOwner: parseEther("0.00015") },
		celo: { symbol: "CELO", deployer: parseEther("0.05"), newOwner: parseEther("0.025") },
		lisk: { symbol: "ETH", deployer: parseEther("0.0002"), newOwner: parseEther("0.0001") },
	};

	const FUND_TX_OVERHEAD: Record<string, bigint> = {
		ethereum: parseEther("0.001"),
		bsc: parseEther("0.0003"),
		polygon: parseEther("0.02"),
		arbitrum: parseEther("0.0001"),
		base: parseEther("0.0001"),
		optimism: parseEther("0.0001"),
		scroll: parseEther("0.0001"),
		celo: parseEther("0.01"),
		lisk: parseEther("0.0001"),
	};

	const CHAINS = [
		{ id: 1, name: "ethereum", rpcs: ["https://ethereum.public.blockpi.network/v1/rpc/public", "https://cloudflare-eth.com"] },
		{ id: 56, name: "bsc", rpcs: ["https://bsc-dataseed.binance.org", "https://bsc.drpc.org"] },
		{ id: 137, name: "polygon", rpcs: ["https://polygon.drpc.org", "https://1rpc.io/matic"] },
		{ id: 42161, name: "arbitrum", rpcs: ["https://arb1.arbitrum.io/rpc", "https://1rpc.io/arb"] },
		{ id: 8453, name: "base", rpcs: ["https://mainnet.base.org", "https://base.drpc.org"] },
		{ id: 10, name: "optimism", rpcs: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"] },
		{ id: 534352, name: "scroll", rpcs: ["https://rpc.scroll.io", "https://scroll.drpc.org"] },
		{ id: 42220, name: "celo", rpcs: ["https://forno.celo.org"] },
		{ id: 1135, name: "lisk", rpcs: ["https://rpc.api.lisk.com", "https://lisk.drpc.org"] },
	];

	async function connect(rpcs: string[], chainId: number) {
		let last: unknown;
		for (const url of rpcs) {
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

	console.log(`FUND_ACCOUNT address: ${FUND}`);
	console.log(`Deployer:   ${DEPLOYER}`);
	console.log(`New owner:  ${NEW_OWNER}\n`);

	const canFund: Array<Record<string, string>> = [];
	const cannotFund: Array<Record<string, string>> = [];

	for (const c of CHAINS) {
		const need = NEED[c.name];
		const overhead = FUND_TX_OVERHEAD[c.name];
		try {
			const provider = await connect(c.rpcs, c.id);
			const [fundBal, depBal, newBal] = await Promise.all([
				provider.getBalance(FUND),
				provider.getBalance(DEPLOYER),
				provider.getBalance(NEW_OWNER),
			]);

			const depShort = depBal < need.deployer ? need.deployer - depBal : 0n;
			const newShort = newBal < need.newOwner ? need.newOwner - newBal : 0n;
			const totalToSend = depShort + newShort;
			const requiredOnFund = totalToSend + overhead;
			const ok = fundBal >= requiredOnFund;

			const row = {
				network: c.name,
				symbol: need.symbol,
				fundBal: formatEther(fundBal),
				depShort: formatEther(depShort),
				newShort: formatEther(newShort),
				sendTotal: formatEther(totalToSend),
				fundNeed: formatEther(requiredOnFund),
			};

			console.log(
				`${c.name.padEnd(12)} FUND=${row.fundBal} ${need.symbol} | ` +
					`send deployer +${row.depShort}, newOwner +${row.newShort} (total ${row.sendTotal}) | ` +
					`need w/ gas ~${row.fundNeed} [${ok ? "CAN FUND" : "SHORT"}]`,
			);

			if (ok) canFund.push(row);
			else cannotFund.push(row);
			provider.destroy();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.log(`${c.name.padEnd(12)} ERROR: ${msg}`);
			cannotFund.push({ network: c.name, error: msg });
		}
	}

	console.log("\n=== Chains FUND_ACCOUNT can fully fund ===");
	if (!canFund.length) console.log("  (none)");
	for (const r of canFund) {
		console.log(
			`  ${r.network}: +${r.depShort} ${r.symbol} → deployer, +${r.newShort} ${r.symbol} → new owner (FUND has ${r.fundBal})`,
		);
	}

	console.log("\n=== Chains FUND_ACCOUNT cannot fully fund ===");
	for (const r of cannotFund) {
		if (r.error) console.log(`  ${r.network}: ${r.error}`);
		else console.log(`  ${r.network}: have ${r.fundBal} ${r.symbol}, need ~${r.fundNeed} ${r.symbol}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
