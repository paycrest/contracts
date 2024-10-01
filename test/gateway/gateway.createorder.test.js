const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const { gatewayFixture } = require("../fixtures/gateway.js");

const {
	deployContract,
	ZERO_AMOUNT,
	ZERO_ADDRESS,
	FEE_BPS,
	MAX_BPS,
	Errors,
	Events,
	getSupportedInstitutions,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Gateway create order", function () {
	beforeEach(async function () {
		[
			this.deployer,
			this.treasuryAddress,
			this.keeper,
			this.aggregator,
			this.alice,
			this.sender,
			this.hacker,
			...this.accounts
		] = await ethers.getSigners();

		({ gateway, mockUSDT } = await gatewayFixture());

		this.mockDAI = await deployContract("MockUSDT");

		this.mockUSDT = mockUSDT;
		this.gateway = gateway;

		this.mintAmount = ethers.utils.parseEther("27000000");
		this.orderAmount = ethers.utils.parseEther("27000000");
		this.protocolFee = ethers.utils.parseEther("27000");


		this.senderFee = ethers.utils.parseEther("0");
		await this.mockUSDT.connect(this.alice).mint(this.mintAmount);
		await this.mockDAI.connect(this.alice).mint(this.mintAmount);
		await this.mockUSDT
			.connect(this.alice)
			.transfer(this.sender.address, this.mintAmount);

		expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
			ZERO_AMOUNT
		);
		expect(await this.mockDAI.balanceOf(this.alice.address)).to.eq(
			this.mintAmount
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

	it("Should be able to create order by Sender for Alice", async function () {
		const ret = await getSupportedInstitutions();
		const treasury = ethers.utils.formatBytes32String("treasury");
		const aggregator = ethers.utils.formatBytes32String("aggregator");

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(treasury, this.treasuryAddress.address);

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(aggregator, this.aggregator.address);

		await this.gateway.connect(this.deployer).updateProtocolFee(FEE_BPS);

		await this.mockUSDT
			.connect(this.sender)
			.approve(this.gateway.address, this.orderAmount.add(this.senderFee));

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
			this.gateway
				.connect(this.sender)
				.createOrder(
					this.mockUSDT.address,
					this.orderAmount,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		)
			.to.emit(this.gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.sender.address,
				this.mockUSDT.address,
				BigNumber.from(this.orderAmount),
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
		] = await this.gateway.getOrderInfoOut(orderId);
		// expect sender balance to increase by sender fee
		expect(await this.mockUSDT.balanceOf(this.sender.address)).to.eq(
			ZERO_AMOUNT
		);

		expect(this.seller).to.eq(this.sender.address);
		expect(this.token).to.eq(this.mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(
			BigNumber.from(this.orderAmount)
		);

		expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
			ZERO_AMOUNT
		);

		// =================== Create Order ===================
		var bytes = CryptoJS.AES.decrypt(messageHash.substring(2), password);
		var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

		const mockUSDT = await this.gateway.isTokenSupported(this.mockUSDT.address);
		expect(mockUSDT).to.eq(true);
		expect(decryptedData[0].bank_account).to.eq("09090990901");
	});

	it("Should revert when creating order with non-supported token", async function () {
		const ret = await getSupportedInstitutions();
		const fee = ethers.utils.formatBytes32String("fee");

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(fee, this.treasuryAddress.address);

		await this.mockDAI
			.connect(this.sender)
			.approve(this.gateway.address, this.mintAmount);
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
			this.gateway
				.connect(this.sender)
				.createOrder(
					this.mockDAI.address,
					this.orderAmount,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		).to.be.revertedWith(Errors.Gateway.TokenNotSupported);

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
		] = await this.gateway.getOrderInfoOut(orderId);

		expect(this.seller).to.eq(ZERO_ADDRESS);
		expect(this.token).to.eq(ZERO_ADDRESS);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(ZERO_ADDRESS);
		expect(this.currentBPS).to.eq(ZERO_AMOUNT);
		expect(this.amount).to.eq(ZERO_AMOUNT);

		expect(await this.mockDAI.balanceOf(this.alice.address)).to.eq(
			this.mintAmount
		);
	});

	it("Should revert when creating order with zero input amount", async function () {
		const ret = await getSupportedInstitutions();
		const fee = ethers.utils.formatBytes32String("fee");

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(fee, this.treasuryAddress.address);

		await this.mockUSDT
			.connect(this.sender)
			.approve(this.gateway.address, this.mintAmount);
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
			this.gateway
				.connect(this.sender)
				.createOrder(
					this.mockUSDT.address,
					ZERO_AMOUNT,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		).to.be.revertedWith(Errors.Gateway.AmountIsZero);

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
		] = await this.gateway.getOrderInfoOut(orderId);

		expect(this.seller).to.eq(ZERO_ADDRESS);
		expect(this.token).to.eq(ZERO_ADDRESS);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(ZERO_ADDRESS);
		expect(this.currentBPS).to.eq(ZERO_AMOUNT);
		expect(this.amount).to.eq(ZERO_AMOUNT);

		expect(await this.mockDAI.balanceOf(this.alice.address)).to.eq(
			this.mintAmount
		);
	});

	it("Should revert when creating order with zero address as refundable address", async function () {
		const ret = await getSupportedInstitutions();
		const fee = ethers.utils.formatBytes32String("fee");

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(fee, this.treasuryAddress.address);

		await this.mockUSDT
			.connect(this.sender)
			.approve(this.gateway.address, this.mintAmount);
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
			this.gateway
				.connect(this.sender)
				.createOrder(
					this.mockUSDT.address,
					this.orderAmount,
					rate,
					this.sender.address,
					this.senderFee,
					ZERO_ADDRESS,
					messageHash.toString()
				)
		).to.be.revertedWith(Errors.Gateway.ThrowZeroAddress);

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
		] = await this.gateway.getOrderInfoOut(orderId);

		expect(this.seller).to.eq(ZERO_ADDRESS);
		expect(this.token).to.eq(ZERO_ADDRESS);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(ZERO_ADDRESS);
		expect(this.currentBPS).to.eq(ZERO_AMOUNT);
		expect(this.amount).to.eq(ZERO_AMOUNT);

		expect(await this.mockUSDT.balanceOf(this.sender.address)).to.eq(
			this.mintAmount
		);
	});

	it("Should revert when creating order with insufficient allowance", async function () {
		const fee = ethers.utils.formatBytes32String("fee");

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(fee, this.treasuryAddress.address);

		await this.mockUSDT
			.connect(this.sender)
			.approve(this.gateway.address, this.protocolFee);
		const rate = 750;
		const data = [
			{ bank_account: "09090990901" },
			{ bank_name: "ACCESS BANK" },
			{ account_name: "Jeff Dean" },
			{ institution_code: "0000" },
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
			this.gateway
				.connect(this.sender)
				.createOrder(
					this.mockUSDT.address,
					this.mintAmount,
					rate,
					this.sender.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		).to.be.revertedWith(Errors.Gateway.Allowance);

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
		] = await this.gateway.getOrderInfoOut(orderId);

		expect(this.seller).to.eq(ZERO_ADDRESS);
		expect(this.token).to.eq(ZERO_ADDRESS);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(ZERO_ADDRESS);
		expect(this.currentBPS).to.eq(ZERO_AMOUNT);
		expect(this.amount).to.eq(ZERO_AMOUNT);

		expect(await this.mockUSDT.balanceOf(this.sender.address)).to.eq(
			this.mintAmount
		);
	});
});
