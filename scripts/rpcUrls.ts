/** Public RPC fallbacks (aligned with hardhat.config.ts). Used when Shield3 is unavailable. */
export const PUBLIC_RPC_FALLBACKS: Record<number, string[]> = {
	1: ["https://ethereum.public.blockpi.network/v1/rpc/public", "https://cloudflare-eth.com"],
	56: ["https://bsc.drpc.org", "https://bsc-dataseed.binance.org"],
	137: ["https://1rpc.io/matic", "https://polygon.drpc.org"],
	42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com", "https://1rpc.io/arb"],
	8453: ["https://mainnet.base.org", "https://base.drpc.org", "https://base-public.nodies.app"],
	10: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
	534352: ["https://scroll.drpc.org", "https://rpc.scroll.io"],
	42220: ["https://forno.celo.org"],
	42420: ["https://mainnet-rpc.assetchain.org"],
	1135: ["https://lisk.drpc.org", "https://rpc.api.lisk.com"],
};

function isUsableShield3Url(url: string): boolean {
	return (
		url.includes("rpc.shield3.com") &&
		!url.includes("undefined") &&
		Boolean(process.env.SHIELD3_API_KEY)
	);
}

/** Ordered RPC candidates: env override → public fallbacks → Shield3 (if keyed). */
export function rpcCandidates(chainId: number, configuredUrl: string): string[] {
	const out: string[] = [];

	const envOverride = process.env[`RPC_URL_${chainId}`];
	if (envOverride) {
		out.push(envOverride);
	}

	for (const fallback of PUBLIC_RPC_FALLBACKS[chainId] ?? []) {
		out.push(fallback);
	}

	if (isUsableShield3Url(configuredUrl)) {
		out.push(configuredUrl);
	} else if (configuredUrl && !configuredUrl.includes("undefined")) {
		out.push(configuredUrl);
	}

	return [...new Set(out)];
}
