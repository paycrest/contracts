const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");

const ZERO_AMOUNT = BigNumber.from("0");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MAX_BPS = BigNumber.from("100000");
const FEE_BPS = BigNumber.from("100");

const Errors = {
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
	},
};

const Events = {
	Gateway: {
		OrderCreated: "OrderCreated",
		OrderSettled: "OrderSettled",
		OrderRefunded: "OrderRefunded",
		SettingManagerBool: "SettingManagerBool",
		ProtocolFeeUpdated: "ProtocolFeeUpdated",
		ProtocolAddressUpdated: "ProtocolAddressUpdated",
	},
};

async function deployContract(name, args = [], value = 0) {
	const Contract = await ethers.getContractFactory(name);
	let instance;

	if (value > 0) instance = await Contract.deploy(...args, { value });
	else instance = await Contract.deploy(...args);

	return instance;
}

async function getSupportedInstitutions() {
	const currency = ethers.utils.formatBytes32String("NGN");

	const accessBank = {
		code: ethers.utils.formatBytes32String("ABNGNGLA"),
		name: ethers.utils.formatBytes32String("ACCESS BANK"),
	};

	const diamondBank = {
		code: ethers.utils.formatBytes32String("DBLNNGLA"),
		name: ethers.utils.formatBytes32String("DIAMOND BANK"),
	};

	return {
		currency,
		accessBank,
		diamondBank,
	};
}

async function mockMintDeposit(gateway, account, usdc, amount) {
	await usdc.connect(account).mint(amount);
	await usdc.connect(account).approve(gateway.address, amount);
}

module.exports = {
	ZERO_AMOUNT,
	ZERO_ADDRESS,
	MAX_BPS,
	FEE_BPS,
	Errors,
	Events,
	deployContract,
	mockMintDeposit,
	getSupportedInstitutions,
};
