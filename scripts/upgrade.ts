import hre from "hardhat";
import { NETWORKS } from "./config";
import { confirmContinue, waitForInput } from "./utils";

const hardhat = hre as unknown as {
	ethers: {
		getContractFactory: (name: string) => Promise<any>;
		getSigners: () => Promise<any[]>;
		Contract: new (address: string, abi: string[], signer: any) => any;
	};
	upgrades: {
		upgradeProxy: (proxyAddress: string, factory: any) => Promise<any>;
		erc1967: {
			getImplementationAddress: (proxyAddress: string) => Promise<string>;
		};
		admin: {
			getInstance: () => Promise<{
				getProxyAdmin: (proxyAddress: string) => Promise<string>;
			}>;
		};
	};
	network: {
		name?: string;
		config: {
			chainId?: number;
		};
	};
	run: (taskName: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const { ethers, upgrades, network } = hardhat;
const chainId = network.config.chainId;
const networkName = network.name ?? process.env.HARDHAT_NETWORK ?? "hardhat";
const networkConfig = NETWORKS[chainId as keyof typeof NETWORKS];

async function getContractAddress(contract: any): Promise<string> {
	return typeof contract.getAddress === "function" ? contract.getAddress() : contract.address;
}

async function deployNewImplementation() {
	const factory = await ethers.getContractFactory("Gateway");
	const newImplementation = await factory.deploy();
	await newImplementation.waitForDeployment?.();
	const address = await getContractAddress(newImplementation);
	console.log("✅ Deployed new implementation: ", address);
	return address;
}

async function upgradeProxy() {
	await confirmContinue({
		contract: "Gateway",
		network: networkName,
		chainId,
	});

	try {
		const [signer] = await ethers.getSigners(); // Account performing the upgrade
		const balance = await signer.getBalance();

		if (balance === 0n) {
			throw new Error(`Can't upgrade ${chainId} with 0 balance`);
		}

		const proxyContractAddress = networkConfig.gatewayContract;
		const factory = await ethers.getContractFactory("Gateway");
		const contract = await upgrades.upgradeProxy(proxyContractAddress, factory);
		const address = await getContractAddress(contract);

		console.log("✅ Upgraded Gateway: ", address);

		await hardhat.run("verify:verify", {
			address,
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
		network: networkName,
		chainId,
	});

	try {
		const [signer] = await ethers.getSigners(); // Account performing the upgrade
		const balance = await signer.getBalance();

		if (balance === 0n) {
			throw new Error(`Can't upgrade ${chainId} with 0 balance`);
		}

		const proxyContractAddress = networkConfig.gatewayContract;
		const currentImplAddress = await upgrades.erc1967.getImplementationAddress(proxyContractAddress);

		// Deploy the new implementation contract
		const newImplementationAddress = await deployNewImplementation();

		// Check if the new implementation address is the same as the current one
		if (currentImplAddress.toLowerCase() === newImplementationAddress.toLowerCase()) {
			throw new Error("New implementation address is the same as the current implementation.");
		}

		const proxyAdminAddress = await upgrades.admin
			.getInstance()
			.then((instance) => instance.getProxyAdmin(proxyContractAddress));

		// Connect to the ProxyAdmin contract
		const ProxyAdminABI = ["function upgrade(address proxy, address implementation) public"];
		const proxyAdmin = new ethers.Contract(proxyAdminAddress, ProxyAdminABI, signer);

		// Perform the upgrade
		const tx = await proxyAdmin.upgrade(proxyContractAddress, newImplementationAddress);
		await tx.wait();

		await hardhat.run("verify:verify", {
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
