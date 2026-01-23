import hre from "hardhat";

// Connect to network and get ethers instance (Hardhat v3 pattern)
const { ethers } = await hre.network.connect();

export const ZERO_AMOUNT = 0n;
// AddressZero is "0x0000000000000000000000000000000000000000"
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MAX_BPS = 100000n;
export const FEE_BPS = 100n;

export const Errors = {
	Ownable: {
		onlyOwner: "Ownable: caller is not the owner",
	},

	Gateway: {
		OnlyAggregator: "OnlyAggregator",
		TokenNotSupported: "TokenNotSupported",
		AmountIsZero: "AmountIsZero",
		ThrowZeroAddress: "ThrowZeroAddress",
		InvalidSigner: "InvalidSigner",
		Unsupported: "Unsupported",
		OrderFulfilled: "OrderFulfilled",
		OrderRefunded: "OrderRefunded",
		UnableToProcessRewards: "UnableToProcessRewards",
		Allowance: "ERC20: insufficient allowance",
		TokenFeeSettingsNotConfigured: "TokenFeeSettingsNotConfigured",
	},
};

export const Events = {
	Gateway: {
		OrderCreated: "OrderCreated",
		OrderSettled: "OrderSettled",
		OrderRefunded: "OrderRefunded",
		SettingManagerBool: "SettingManagerBool",
		ProtocolFeeUpdated: "ProtocolFeeUpdated",
		ProtocolAddressUpdated: "ProtocolAddressUpdated",
		LocalTransferFeeSplit: "LocalTransferFeeSplit",
		FxTransferFeeSplit: "FxTransferFeeSplit",
		TokenFeeSettingsUpdated: "TokenFeeSettingsUpdated",
	},
};

export async function deployContract(name, args = [], value = 0) {
	// Get the default signer (first signer)
	const [deployer] = await ethers.getSigners();
	const factory = await ethers.getContractFactory(name);
	const instance = value > 0 
		? await factory.connect(deployer).deploy(...args, { value })
		: await factory.connect(deployer).deploy(...args);
	await instance.waitForDeployment();
	return instance;
}

export async function getSupportedInstitutions() {
	const currency = ethers.encodeBytes32String("NGN");

	const accessBank = {
		code: ethers.encodeBytes32String("ABNGNGLA"),
		name: ethers.encodeBytes32String("ACCESS BANK"),
	};

	const diamondBank = {
		code: ethers.encodeBytes32String("DBLNNGLA"),
		name: ethers.encodeBytes32String("DIAMOND BANK"),
	};

	return {
		currency,
		accessBank,
		diamondBank,
	};
}

export async function mockMintDeposit(gateway, account, usdc, amount) {
	await usdc.connect(account).mint(amount);
	await usdc.connect(account).approve(gateway.address, amount);
}

// Helper function to configure token fee settings
export async function configureTokenFeeSettings(gateway, deployer, tokenAddress, settings = {}) {
	const {
		senderToProvider = 50000,      // 50% of sender fee goes to provider
		providerToAggregator = 50000, // 50% of provider's share goes to aggregator
		senderToAggregator = 0,       // 0% of sender fee goes to aggregator (FX mode)
		providerToAggregatorFx = 500  // 0.5% of transaction amount provider pays to aggregator (FX mode)
	} = settings;

	await gateway.connect(deployer).setTokenFeeSettings(
		tokenAddress,
		senderToProvider,
		providerToAggregator,
		senderToAggregator,
		providerToAggregatorFx
	);
}
