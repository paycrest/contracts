const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const { gatewayFixture } = require("../fixtures/gateway.js");

const {
	ZERO_AMOUNT,
	FEE_BPS,
	MAX_BPS,
	Events,
	getSupportedInstitutions,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Gateway settle order", function () {
	beforeEach(async function () {
		[
			this.deployer,
			this.treasuryAddress,
			this.primaryValidator,
			this.aggregator,
			this.alice,
			this.bob,
			this.liquidityProvider,
			this.sender,
			this.hacker,
			...this.accounts
		] = await ethers.getSigners();

		({ gateway, mockUSDT } = await gatewayFixture());

		this.mintAmount = ethers.utils.parseEther("27000000");
		this.orderAmount = ethers.utils.parseEther("27000000");
		this.senderFee = ethers.utils.parseEther("0");
		
		//
		
		// charge 0.1% as protocol fee
		const protocolFeePercent = BigNumber.from(100);
		
		this.protocolFee = ethers.utils.parseEther("27000")

		this.liquidityProviderAmount = this.orderAmount.sub(this.protocolFee);

		await expect(
			gateway.connect(this.deployer).updateProtocolFee(protocolFeePercent)
		)
			.to.emit(gateway, Events.Gateway.ProtocolFeeUpdated)
			.withArgs(protocolFeePercent);

		await mockUSDT.connect(this.alice).mint(this.mintAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(this.mintAmount);
		await mockUSDT
			.connect(this.alice)
			.transfer(this.sender.address, this.mintAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			ZERO_AMOUNT
		);

		expect(await mockUSDT.balanceOf(this.aggregator.address)).to.eq(
			ZERO_AMOUNT
		);
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			ZERO_AMOUNT
		);

		const treasury = ethers.utils.formatBytes32String("treasury");

		await expect(
			gateway
				.connect(this.deployer)
				.updateProtocolAddress(treasury, this.treasuryAddress.address)
		).to.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

		const aggregator = ethers.utils.formatBytes32String("aggregator");

		await expect(
			gateway
				.connect(this.deployer)
				.updateProtocolAddress(aggregator, this.aggregator.address)
		).to.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

		await expect(
			gateway.connect(this.deployer).updateProtocolFee(FEE_BPS)
		).to.emit(gateway, Events.Gateway.ProtocolFeeUpdated);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.address)
		).to.equal(ZERO_AMOUNT);

		const token = ethers.utils.formatBytes32String("token");

		await expect(
			gateway
				.connect(this.deployer)
				.settingManagerBool(token, mockUSDT.address, BigNumber.from(1))
		)
			.to.emit(gateway, Events.Gateway.SettingManagerBool)
			.withArgs(token, mockUSDT.address, BigNumber.from(1));
	});

	it("Should be able to create order by the sender and settled by the liquidity aggregator", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount);

		expect(
			await mockUSDT.allowance(this.sender.address, gateway.address)
		).to.equal(this.mintAmount);

		const rate = 750;
		const data = [
			{ bank_account: "09090990901" },
			{ bank_name: "ACCESS BANK" },
			{ account_name: "Jeff Dean" },
			{ institution_code: ret.accessBank.code },
		];
		const password = "123";

		const cipher = CryptoJS.AES.encrypt(
			JSON.stringify(data),
			password
		).toString();

		const messageHash = "0x" + cipher;

		const argOrderID = [this.sender.address, 1];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

		await expect(
			gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.sender.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

		[
			this.seller,
			this.token,
			this.senderRecipient,
			this.senderFee,
			this.protocolFee,
			this.isFulfilled,
			this.isRefunded,
			this.refundAddress,
			this.currentBPS,
			this.amount,
		] = await gateway.getOrderInfo(orderId);

		expect(this.seller).to.eq(this.sender.address);
		expect(this.token).to.eq(mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(BigNumber.from(this.orderAmount));

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.address)
		).to.equal(ZERO_AMOUNT);

		// =================== Create Order ===================

		expect(
			await gateway
				.connect(this.aggregator)
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should revert when trying to settle an already fulfilled order", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount);

		expect(
			await mockUSDT.allowance(this.sender.address, gateway.address)
		).to.equal(this.mintAmount);

		const rate = 750;
		const data = [
			{ bank_account: "09090990901" },
			{ bank_name: "ACCESS BANK" },
			{ account_name: "Jeff Dean" },
			{ institution_code: ret.accessBank.code },
		];
		const password = "123";

		const cipher = CryptoJS.AES.encrypt(
			JSON.stringify(data),
			password
		).toString();

		const messageHash = "0x" + cipher;

		const argOrderID = [this.sender.address, 1];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

		await expect(
			gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.sender.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

		[
			this.seller,
			this.token,
			this.senderRecipient,
			this.senderFee,
			this.protocolFee,
			this.isFulfilled,
			this.isRefunded,
			this.refundAddress,
			this.currentBPS,
			this.amount,
		] = await gateway.getOrderInfo(orderId);

		expect(this.seller).to.eq(this.sender.address);
		expect(this.token).to.eq(mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(
			BigNumber.from(this.orderAmount)
		);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.address)
		).to.equal(ZERO_AMOUNT);

		// =================== Create Order ===================
		expect(
			await gateway
				.connect(this.aggregator)
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);

		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});
});
