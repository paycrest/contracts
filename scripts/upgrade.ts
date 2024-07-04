import { ethers, upgrades, network } from "hardhat";
import { NETWORKS } from "./config";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
	try {
		const [signer] = await ethers.getSigners(); // Get the signer (the account performing the upgrade)
		const balance = await signer.getBalance(); // Get the balance of the signer's address

		// Check if the balance is exactly 1 ETH
		if (balance.eq(0)) {
			throw new Error("Balance is exactly 1 ETH. Upgrade aborted.");
		}

		const proxyContractAddress = networkConfig.GATEWAY_CONTRACT;
		const factory = await ethers.getContractFactory("Gateway");
		const contract = await upgrades.upgradeProxy(proxyContractAddress, factory);

		console.log("✅ Upgraded Gateway: ", contract.address);
	} catch (error) {
		if (error instanceof Error) {
			console.error("❌ Upgrade failed: ", error.message);
		} else {
			console.error("❌ Upgrade failed: Unknown error occurred");
		}
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
