import { expect } from "chai";
import hre from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import CryptoJS from "crypto-js";

import { gatewayFixture } from "../fixtures/gateway.js";

import {
	deployContract,
	ZERO_AMOUNT,
	ZERO_ADDRESS,
	FEE_BPS,
	MAX_BPS,
	Errors,
	Events,
	getSupportedInstitutions,
} from "../utils/utils.manager.js";

// Connect to network and get ethers instance (Hardhat v3 pattern)
const { ethers } = await hre.network.connect();

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

		const fixture = await gatewayFixture();
		this.gateway = fixture.gateway;
		this.mockUSDT = fixture.mockUSDT;

		// Deploy MockDAI using the same pattern as mockUSDT fixture
		const MockDAIFactory = await ethers.getContractFactory("MockUSDT");
		this.mockDAI = await MockDAIFactory.deploy();
		await this.mockDAI.waitForDeployment();
		// Verify deployment
		const mockDAIAddr = await this.mockDAI.getAddress();
		expect(mockDAIAddr).to.not.be.undefined;

		this.mintAmount = ethers.parseEther("27000000");
		this.orderAmount = ethers.parseEther("27000000");
		// Protocol fee is calculated based on rate and token settings
		// For FX transfers (rate ≠ 1), it's calculated as: (amount * providerToAggregatorFx) / MAX_BPS
		// For local transfers (rate = 1), it's 0
		this.protocolFee = ethers.parseEther("135000"); // 0.5% of 27000000 for FX transfer


		this.senderFee = ethers.parseEther("0");
		
		const senderAddress = await this.sender.getAddress();
		const aliceAddress = await this.alice.getAddress();
		
		// Mint tokens and wait for transactions
		const mintTx1 = await this.mockUSDT.connect(this.alice).mint(this.mintAmount);
		const receipt1 = await mintTx1.wait();
		expect(receipt1.status).to.eq(1);
		
		// Get fresh contract instance to avoid caching issues
		const mockUSDTAddress = await this.mockUSDT.getAddress();
		const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
		const mockUSDTFresh = MockUSDTFactory.attach(mockUSDTAddress);
		
		// Verify mockUSDT balance after mint using fresh instance
		const balanceUSDT = await mockUSDTFresh.balanceOf(aliceAddress);
		expect(balanceUSDT).to.eq(this.mintAmount);
		
		// Update this.mockUSDT to use the fresh instance for subsequent operations
		this.mockUSDT = mockUSDTFresh;
		
		// Check balance before minting mockDAI
		const balanceDAIBefore = await this.mockDAI.balanceOf(aliceAddress);
		
		const mintTx2 = await this.mockDAI.connect(this.alice).mint(this.mintAmount);
		const receipt2 = await mintTx2.wait();
		expect(receipt2.status).to.eq(1);
		
		// Get fresh contract instance for mockDAI to avoid caching issues
		const mockDAIAddress = await this.mockDAI.getAddress();
		const MockDAIFactory2 = await ethers.getContractFactory("MockUSDT");
		const mockDAIFresh = MockDAIFactory2.attach(mockDAIAddress);
		
		// Verify mockDAI balance after mint using fresh instance
		const balanceDAIAlice = await mockDAIFresh.balanceOf(aliceAddress);
		// Balance should be previous balance + mintAmount
		expect(balanceDAIAlice).to.eq(balanceDAIBefore + this.mintAmount);
		
		// Update this.mockDAI to use the fresh instance
		this.mockDAI = mockDAIFresh;
		
		// Transfer and wait
		const transferTx = await this.mockUSDT
			.connect(this.alice)
			.transfer(senderAddress, this.mintAmount);
		await transferTx.wait();

		expect(await this.mockUSDT.balanceOf(aliceAddress)).to.eq(
			ZERO_AMOUNT
		);
		expect(await this.mockDAI.balanceOf(aliceAddress)).to.eq(
			this.mintAmount
		);
	});

	it("Should be able to create order by Sender for Alice", async function () {
		const ret = await getSupportedInstitutions();
		const treasury = ethers.encodeBytes32String("treasury");
		const aggregator = ethers.encodeBytes32String("aggregator");

		const treasuryAddress = await this.treasuryAddress.getAddress();
		const aggregatorAddress = await this.aggregator.getAddress();
		const gatewayAddress = await this.gateway.getAddress();

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(treasury, treasuryAddress);

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(aggregator, aggregatorAddress);

		await this.mockUSDT
			.connect(this.sender)
			.approve(gatewayAddress, this.orderAmount + this.senderFee);

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

		// Create order and capture the actual order ID from the event
		const mockUSDTAddress = await this.mockUSDT.getAddress();
		const senderAddress = await this.sender.getAddress();
		const aliceAddress = await this.alice.getAddress();
		
		const tx = await this.gateway
			.connect(this.sender)
			.createOrder(
				mockUSDTAddress,
				this.orderAmount,
				rate,
				senderAddress,
				this.senderFee,
				aliceAddress,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		
		// Parse events from receipt logs (ethers v6)
		let orderId;
		for (const log of receipt.logs) {
			try {
				const parsed = this.gateway.interface.parseLog(log);
				if (parsed && parsed.name === Events.Gateway.OrderCreated) {
					orderId = parsed.args.orderId;
					break;
				}
			} catch (e) {
				// Not a Gateway event, continue
			}
		}

		await expect(tx)
			.to.emit(this.gateway, Events.Gateway.OrderCreated)
			.withArgs(
				aliceAddress,
				mockUSDTAddress,
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
		] = await this.gateway.getOrderInfo(orderId);
		// expect sender balance to increase by sender fee
		expect(await this.mockUSDT.balanceOf(senderAddress)).to.eq(
			ZERO_AMOUNT
		);

		expect(this.seller.toLowerCase()).to.eq(senderAddress.toLowerCase());
		expect(this.token.toLowerCase()).to.eq(mockUSDTAddress.toLowerCase());
		expect(this.senderRecipient.toLowerCase()).to.eq(senderAddress.toLowerCase());
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress.toLowerCase()).to.eq(aliceAddress.toLowerCase());
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(
			this.orderAmount
		);

		expect(await this.mockUSDT.balanceOf(aliceAddress)).to.eq(
			ZERO_AMOUNT
		);

		// =================== Create Order ===================
		var bytes = CryptoJS.AES.decrypt(messageHash.substring(2), password);
		var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

		const mockUSDT = await this.gateway.isTokenSupported(mockUSDTAddress);
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
		] = await this.gateway.getOrderInfo(orderId);

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
		] = await this.gateway.getOrderInfo(orderId);

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
		] = await this.gateway.getOrderInfo(orderId);

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
		] = await this.gateway.getOrderInfo(orderId);

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

	it("Should create order with zero protocol fee for local transfer (rate = 1)", async function () {
		const ret = await getSupportedInstitutions();
		const treasury = ethers.utils.formatBytes32String("treasury");
		const aggregator = ethers.utils.formatBytes32String("aggregator");

		// Set a sender fee for local transfer (required by contract)
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await this.mockUSDT.connect(this.alice).mint(this.senderFee);
		await this.mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(treasury, this.treasuryAddress.address);

		await this.gateway
			.connect(this.deployer)
			.updateProtocolAddress(aggregator, this.aggregator.address);

		await this.mockUSDT
			.connect(this.sender)
			.approve(this.gateway.address, this.orderAmount.add(this.senderFee));

		const rate = 100; // Local transfer (rate = 1)

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

		// Create order and capture the actual order ID from the event
		const tx = await this.gateway
			.connect(this.sender)
			.createOrder(
				this.mockUSDT.address,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderCreatedEvent = receipt.events.find(e => e.event === 'OrderCreated');
		const orderId = orderCreatedEvent.args.orderId;

		await expect(tx)
			.to.emit(this.gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				this.mockUSDT.address,
				BigNumber.from(this.orderAmount),
				ZERO_AMOUNT, // Protocol fee should be 0 for local transfers
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
		] = await this.gateway.getOrderInfo(orderId);

		expect(this.seller).to.eq(this.sender.address);
		expect(this.token).to.eq(this.mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.protocolFee).to.eq(ZERO_AMOUNT); // Should be 0 for local transfers
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(BigNumber.from(this.orderAmount));
	});
});
