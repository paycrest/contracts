/**
 * Upgrade a Gateway transparent proxy via ProxyAdmin using NEW_OWNER_PRIVATE_KEY.
 *
 * Usage:
 *   GATEWAY_PROXY=0x56dA... GATEWAY_IMPLEMENTATION=0x2F2E... \
 *     npx hardhat run scripts/upgradeGatewayProxy.ts --network base
 */
import "dotenv/config";
import { Contract, JsonRpcProvider, Network, Wallet, getAddress, formatEther } from "ethers";

const ADMIN_ABI = [
	"function owner() view returns (address)",
	"function upgrade(address proxy, address implementation)",
	"function getProxyImplementation(address proxy) view returns (address)",
];

const IMPLEMENTATION_SLOT =
	"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function readImpl(provider: JsonRpcProvider, admin: Contract, proxy: string): Promise<string> {
	try {
		return getAddress(await admin.getProxyImplementation(proxy));
	} catch {
		const slot = await provider.getStorage(proxy, IMPLEMENTATION_SLOT);
		return getAddress(`0x${slot.slice(-40)}`);
	}
}

async function main() {
	const pk = process.env.NEW_OWNER_PRIVATE_KEY?.trim();
	if (!pk) {
		throw new Error("NEW_OWNER_PRIVATE_KEY is not set");
	}

	const proxy = getAddress(
		process.env.GATEWAY_PROXY?.trim() || "0x56dA8fCE8FD64CaaE90D80DED55587b282bb4303",
	);
	const implementation = getAddress(
		process.env.GATEWAY_IMPLEMENTATION?.trim() || "0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21",
	);
	const proxyAdmin = getAddress(
		process.env.PROXY_ADMIN?.trim() || "0x16c9C78Dbb224889E3e2ADef991C8c4438ea797B",
	);
	const expectedOwner = getAddress("0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD");

	const chainId = 8453;
	const provider = new JsonRpcProvider(
		process.env.RPC_URL_8453?.trim() || "https://mainnet.base.org",
		Network.from(chainId),
		{ staticNetwork: Network.from(chainId) },
	);
	const wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
	if (getAddress(wallet.address) !== expectedOwner) {
		throw new Error(`NEW_OWNER_PRIVATE_KEY derives ${wallet.address}, expected ${expectedOwner}`);
	}

	const admin = new Contract(proxyAdmin, ADMIN_ABI, wallet);
	const adminOwner = getAddress(await admin.owner());
	console.log(`proxy: ${proxy}`);
	console.log(`implementation: ${implementation}`);
	console.log(`proxyAdmin: ${proxyAdmin}`);
	console.log(`signer: ${wallet.address}`);
	console.log(`balance: ${formatEther(await provider.getBalance(wallet.address))} ETH`);
	console.log(`proxyAdminOwner: ${adminOwner}`);

	if (adminOwner !== expectedOwner) {
		throw new Error(`ProxyAdmin owner is ${adminOwner}, expected ${expectedOwner}`);
	}

	const code = await provider.getCode(implementation);
	if (!code || code === "0x") {
		throw new Error(`implementation ${implementation} has no code`);
	}

	const before = await readImpl(provider, admin, proxy);
	console.log(`implBefore: ${before}`);
	if (before.toLowerCase() === implementation.toLowerCase()) {
		console.log("Already upgraded — nothing to do.");
		return;
	}

	const tx = await admin.upgrade(proxy, implementation);
	console.log(`upgrade tx: ${tx.hash}`);
	const receipt = await tx.wait();
	if (!receipt || receipt.status !== 1) {
		throw new Error(`upgrade failed status=${receipt?.status ?? "unknown"}`);
	}

	const after = await readImpl(provider, admin, proxy);
	console.log(`implAfter: ${after}`);
	if (after.toLowerCase() !== implementation.toLowerCase()) {
		throw new Error(`upgrade mismatch: got ${after}`);
	}
	console.log("OK");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
