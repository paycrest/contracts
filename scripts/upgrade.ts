import { ethers, upgrades, network } from "hardhat";
import { NETWORKS } from "./config";
import hre from "hardhat";
import { confirmContinue } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
	await confirmContinue({
			contract: "Gateway",
			network: network.name,
			chainId: network.config.chainId,
		});
	try {
		const [signer] = await ethers.getSigners(); // Get the signer (the account performing the upgrade)
		const balance = await signer.getBalance(); // Get the balance of the signer's address

		if (balance.eq(0)) {
			throw new Error(
				`"Can't upgrade ${network.config.chainId} with 0 balance`
			);
		}

		const proxyContractAddress = networkConfig.GATEWAY_CONTRACT;
		const factory = await ethers.getContractFactory("Gateway");
		const contract = await upgrades.upgradeProxy(proxyContractAddress, factory);

		console.log("✅ Upgraded Gateway: ", contract.address);

		await hre.run("verify:verify", {
			address: contract.address,
		});
	} catch (error) {
		if (error instanceof Error) {
			console.error("❌ Upgrade failed: ", error.message);
		} else {
			console.error("❌ Upgrade failed: Unknown error occurred");
		}

	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
