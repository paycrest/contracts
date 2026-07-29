/**
 * Accept Ownable2Step ownership on a Gateway proxy using NEW_OWNER_PRIVATE_KEY.
 *
 * Usage:
 *   npx hardhat run scripts/acceptGatewayOwnership.ts --network base
 *   GATEWAY_PROXY=0x56dA... npx hardhat run scripts/acceptGatewayOwnership.ts --network base
 */
import "dotenv/config";
import { Contract, JsonRpcProvider, Network, Wallet, getAddress } from "ethers";
import { NETWORKS } from "./config";

const ABI = [
	"function owner() view returns (address)",
	"function pendingOwner() view returns (address)",
	"function acceptOwnership()",
];

async function main() {
	const pk = process.env.NEW_OWNER_PRIVATE_KEY?.trim();
	if (!pk) {
		throw new Error("NEW_OWNER_PRIVATE_KEY is not set");
	}

	const chainId = 8453;
	const networkConfig = NETWORKS[chainId];
	const proxy = getAddress(
		process.env.GATEWAY_PROXY?.trim() || "0x56dA8fCE8FD64CaaE90D80DED55587b282bb4303",
	);
	const expectedNewOwner = getAddress("0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD");

	const provider = new JsonRpcProvider(
		process.env.RPC_URL_8453?.trim() || "https://mainnet.base.org",
		Network.from(chainId),
		{ staticNetwork: Network.from(chainId) },
	);
	const wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
	if (getAddress(wallet.address) !== expectedNewOwner) {
		throw new Error(
			`NEW_OWNER_PRIVATE_KEY derives ${wallet.address}, expected ${expectedNewOwner}`,
		);
	}

	const gateway = new Contract(proxy, ABI, wallet);
	const ownerBefore = getAddress(await gateway.owner());
	const pending = getAddress(await gateway.pendingOwner());
	const balance = await provider.getBalance(wallet.address);

	console.log(`proxy: ${proxy}`);
	console.log(`signer: ${wallet.address}`);
	console.log(`balance: ${balance.toString()} wei`);
	console.log(`ownerBefore: ${ownerBefore}`);
	console.log(`pendingOwner: ${pending}`);
	console.log(`configGateway (prod ref): ${networkConfig?.gatewayContract ?? "(none)"}`);

	if (pending !== expectedNewOwner) {
		if (ownerBefore === expectedNewOwner) {
			console.log("Already owner — nothing to do.");
			return;
		}
		throw new Error(`pendingOwner is ${pending}, expected ${expectedNewOwner}`);
	}

	const tx = await gateway.acceptOwnership();
	console.log(`acceptOwnership tx: ${tx.hash}`);
	const receipt = await tx.wait();
	if (!receipt || receipt.status !== 1) {
		throw new Error(`acceptOwnership failed status=${receipt?.status ?? "unknown"}`);
	}

	console.log(`ownerAfter: ${getAddress(await gateway.owner())}`);
	console.log(`pendingAfter: ${getAddress(await gateway.pendingOwner())}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
