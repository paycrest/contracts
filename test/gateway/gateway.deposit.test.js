const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");

const { gatewayFixture } = require("../fixtures/gateway.js");

const {
	deployContract,
	ZERO_AMOUNT,
	Errors,
	Events,
	mockMintDeposit,
	assertBalance,
	assertDepositBalance,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Gateway Provider deposit", function () {
	beforeEach(async function () {
		[
			this.deployer,
			this.treasuryAddress,
			this.alice,
			this.bob,
			this.Eve,
			this.hacker,
			...this.accounts
		] = await ethers.getSigners();

		({ gateway, mockUSDT } = await gatewayFixture());

		this.mockDAI = await deployContract("MockUSDT");

		this.mockUSDT = mockUSDT;
		this.gateway = gateway;

		this.depositAmount = ethers.utils.parseEther("1000000");

		await mockMintDeposit(gateway, this.alice, mockUSDT, this.depositAmount);
		await mockMintDeposit(gateway, this.bob, mockUSDT, this.depositAmount);
		await mockMintDeposit(gateway, this.Eve, mockUSDT, this.depositAmount);
		await mockMintDeposit(
			gateway,
			this.alice,
			this.mockDAI,
			this.depositAmount
		);
		await mockMintDeposit(gateway, this.bob, this.mockDAI, this.depositAmount);
		await mockMintDeposit(gateway, this.Eve, this.mockDAI, this.depositAmount);

		await assertBalance(
			this.mockUSDT,
			this.mockDAI,
			this.alice.address,
			this.depositAmount
		);
		await assertBalance(
			this.mockUSDT,
			this.mockDAI,
			this.bob.address,
			this.depositAmount
		);
		await assertBalance(
			this.mockUSDT,
			this.mockDAI,
			this.Eve.address,
			this.depositAmount
		);

		const token = ethers.utils.formatBytes32String("token");

		await expect(
			this.gateway
				.connect(this.deployer)
				.settingManagerBool(token, this.mockUSDT.address, BigNumber.from(1))
		)
			.to.emit(this.gateway, Events.Gateway.SettingManagerBool)
			.withArgs(token, this.mockUSDT.address, BigNumber.from(1));
	});

	it("Should be able to deposit and update user balance", async function () {
		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.alice.address,
			ZERO_AMOUNT
		);
		await expect(
			this.gateway
				.connect(this.alice)
				.deposit(this.mockUSDT.address, this.depositAmount)
		)
			.to.emit(this.gateway, Events.Gateway.Deposit)
			.withArgs(
				this.alice.address,
				this.mockUSDT.address,
				BigNumber.from(this.depositAmount)
			);

		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.alice.address,
			this.depositAmount
		);
	});

	it("SHould fail when amount deposited is zero", async function () {
		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.bob.address,
			ZERO_AMOUNT
		);
		await expect(
			this.gateway.connect(this.bob).deposit(this.mockUSDT.address, ZERO_AMOUNT)
		).to.be.revertedWith(Errors.Gateway.AmountIsZero);

		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.bob.address,
			ZERO_AMOUNT
		);
	});

	it("Should fail when token is not supported", async function () {
		await assertDepositBalance(
			this.gateway,
			this.mockDAI.address,
			this.hacker.address,
			ZERO_AMOUNT
		);
		await expect(
			this.gateway
				.connect(this.hacker)
				.deposit(this.mockDAI.address, this.depositAmount)
		).to.be.revertedWith(Errors.Gateway.TokenNotSupported);

		await assertDepositBalance(
			this.gateway,
			this.mockDAI.address,
			this.hacker.address,
			ZERO_AMOUNT
		);
	});
});
