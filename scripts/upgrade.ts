import { ethers, upgrades, network } from "hardhat";
import { NETWORKS } from "./config";
import hre from "hardhat";
import { confirmContinue, waitForInput } from "./utils";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function deployNewImplementation() {
    const factory = await ethers.getContractFactory("Gateway");
    const newImplementation = await factory.deploy();
    await newImplementation.deployed();
    console.log("✅ Deployed new implementation: ", newImplementation.address);
    return newImplementation.address;
}

async function upgradeProxy() {
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

		const proxyContractAddress = networkConfig.gatewayContract;
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

async function manualUpgrade() {
	await confirmContinue({
		contract: "Gateway",
		network: network.name,
		chainId: network.config.chainId,
	});

	try {

		const [signer] = await ethers.getSigners(); // Get the signer (the account performing the upgrade)
		const balance = await signer.getBalance(); // Get the balance of the signer's address
		if (balance.eq(0)) {
			throw new Error(`Can't upgrade ${network.config.chainId} with 0 balance`);
		}
		const proxyContractAddress = networkConfig.gatewayContract;

		const currentImplAddress = await upgrades.erc1967.getImplementationAddress(proxyContractAddress);

        // Deploy the new implementation contract
        const newImplementationAddress = await deployNewImplementation();

        // Check if the new implementation address is the same as the current one
        if (currentImplAddress.toLowerCase() === newImplementationAddress.toLowerCase()) {
            throw new Error("New implementation address is the same as the current implementation.");
        }

		const proxyAdminAddress = await upgrades.admin.getInstance().then((instance) =>
            instance.getProxyAdmin(proxyContractAddress)
        );

		// Connect to the ProxyAdmin contract
        const ProxyAdminABI = [
            "function upgrade(address proxy, address implementation) public",
        ];
        const proxyAdmin = new ethers.Contract(proxyAdminAddress, ProxyAdminABI, signer);

        // Perform the upgrade
        const tx = await proxyAdmin.upgrade(proxyContractAddress, newImplementationAddress);
        await tx.wait();

		await hre.run("verify:verify", {
			address: proxyContractAddress,
		});

        console.log("✅ Proxy upgraded successfully!");

	} catch (error) {
		if (error instanceof Error) {
		console.error("❌ Upgrade failed: ", error.message);
		} else {
		console.error("❌ Upgrade failed: Unknown error occurred");
		}
	}

}

async function main() {
	const response = await waitForInput("\nDo you want to deploy and upgrade? y/N\n");
	if (response !== "y") {
		await manualUpgrade();
	} else {
		await upgradeProxy();
	}
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
