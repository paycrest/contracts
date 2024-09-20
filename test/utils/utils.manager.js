const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require("chai");

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
		Deposit: "Deposit",
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

async function mockMintDeposit(gateway, account, token, amount) {
	await token.connect(account).mint(amount);
	await token.connect(account).approve(gateway.address, amount);
}

async function assertBalance(mockUSDT, mockDAI, account, depositAmount) {
	expect(await mockDAI.balanceOf(account)).to.eq(depositAmount);
	expect(await mockUSDT.balanceOf(account)).to.eq(depositAmount);
}

async function assertDepositBalance(gateway, token, account, amount) {
	expect(await gateway.getBalance(token, account)).to.eq(amount);
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
	assertBalance,
	assertDepositBalance,
	getSupportedInstitutions,
};
