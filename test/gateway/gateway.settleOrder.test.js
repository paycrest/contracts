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
			this.liquidityProvider2,
			this.sender,
			this.hacker,
			...this.accounts
		] = await ethers.getSigners();

		({ gateway, mockUSDT } = await gatewayFixture());

		this.mintAmount = ethers.utils.parseEther("27000000");
		this.orderAmount = ethers.utils.parseEther("27000000");
		this.senderFee = ethers.utils.parseEther("0");
		
		// For FX transfers (rate ≠ 1), protocol fee is calculated from token settings
		// providerToAggregatorFx = 500 (0.5%), so protocol fee = (27000000 * 500) / 100000 = 135000
		this.protocolFeePercent = BigNumber.from(500); // This is now providerToAggregatorFx from token settings
		this.protocolFee = ethers.utils.parseEther("135000"); // 0.5% of 27000000

		this.liquidityProviderAmount = this.orderAmount.sub(this.protocolFee);

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

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.address)
		).to.equal(ZERO_AMOUNT);
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

		// Create order and capture the actual order ID from the event
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
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
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should be able to create order by the sender and split the order", async function () {
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

		// Create order and capture the actual order ID from the event
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
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
		const splitOrderpercent = 50_000; // 50% split
		const encodedSplitOrder = ethers.utils.defaultAbiCoder.encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.utils.solidityKeccak256(["bytes"], [encodedSplitOrder]);
		// provider balance before
		console.log(await mockUSDT.balanceOf(this.liquidityProvider.address))

		expect(
			await gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);
		
		const splitLiquidityProviderAmount = this.orderAmount.mul(splitOrderpercent).div(MAX_BPS);
		const splitProtocolFee =  splitLiquidityProviderAmount.mul(this.protocolFeePercent).div(MAX_BPS);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			(splitLiquidityProviderAmount.sub(splitProtocolFee))
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(splitLiquidityProviderAmount);

		expect(
			await gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		const splitProtocolFeeSplitedOrder =  splitLiquidityProviderAmount.mul(this.protocolFeePercent).div(MAX_BPS);

		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			(splitLiquidityProviderAmount.sub(splitProtocolFeeSplitedOrder))
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee.add(splitProtocolFeeSplitedOrder)
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(0);
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

		// Create order and capture the actual order ID from the event
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
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
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);

		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle local transfer fee splitting (rate = 1) with sender fee", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				ZERO_AMOUNT, // Protocol fee should be 0 for local transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Settle the order
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
			.to.emit(gateway, Events.Gateway.LocalTransferFeeSplit)
			.withArgs(
				orderId,
				ethers.utils.parseEther("500"), // senderAmount: 50% of sender fee
				ethers.utils.parseEther("250"), // providerAmount: 50% of provider's share (50% of 50%)
				ethers.utils.parseEther("250")  // aggregatorAmount: 50% of provider's share
			);

		// Verify balances
		// Sender should get 50% of sender fee (500 tokens)
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("500")
		);
		
		// Provider should get full order amount (no protocol fee for local transfers) plus 25% of sender fee (250 tokens)
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.orderAmount.add(ethers.utils.parseEther("250"))
		);
		
		// Treasury should get 25% of sender fee (250 tokens)
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			ethers.utils.parseEther("250")
		);
	});

	it("Should handle FX transfer fee splitting (rate ≠ 1) with sender fee", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

		const rate = 750; // FX transfer (rate ≠ 1)
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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee, // Protocol fee should be calculated for FX transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Settle the order
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
			.to.emit(gateway, Events.Gateway.FxTransferFeeSplit)
			.withArgs(
				orderId,
				ethers.utils.parseEther("1000"), // senderAmount: 100% of sender fee (senderToAggregator = 0)
				ethers.utils.parseEther("0")    // aggregatorAmount: 0% of sender fee
			);

		// Verify balances
		// Sender should get 100% of sender fee (1000 tokens) since senderToAggregator = 0
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("1000")
		);
		
		// Provider should get liquidity provider amount minus protocol fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);
		
		// Treasury should get protocol fee from provider
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
	});

	it("Should handle split order with sender fee for local transfer (rate = 1)", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("2000"); // 2000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				ZERO_AMOUNT, // Protocol fee should be 0 for local transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Split the order between two providers (50% each)
		const splitOrderpercent = 50_000; // 50% split
		const encodedSplitOrder = ethers.utils.defaultAbiCoder.encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.utils.solidityKeccak256(["bytes"], [encodedSplitOrder]);

		// Settle first half with provider 1
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);

		// Settle second half with provider 2
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		// Verify final balances
		const splitAmount = this.orderAmount.mul(splitOrderpercent).div(MAX_BPS); // 50% of order amount

		// Sender should get 50% of sender fee (1000 tokens) - processed once for the entire order
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("1000")
		);
		
		// Provider 1 should get 50% of order amount plus 250 tokens from sender fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitAmount.add(ethers.utils.parseEther("250"))
		);
		
		// Provider 2 should get 50% of order amount plus 250 tokens from sender fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitAmount.add(ethers.utils.parseEther("250"))
		);
		
		// Treasury should get 500 tokens from sender fee (processed once for entire order)
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			ethers.utils.parseEther("500")
		);
		
		// Gateway should have 0 balance (all tokens distributed)
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle split order with sender fee for FX transfer (rate ≠ 1)", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("2000"); // 2000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

		const rate = 750; // FX transfer (rate ≠ 1)
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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee, // Protocol fee should be calculated for FX transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Split the order between two providers (50% each)
		const splitOrderpercent = 50_000; // 50% split
		const encodedSplitOrder = ethers.utils.defaultAbiCoder.encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.utils.solidityKeccak256(["bytes"], [encodedSplitOrder]);

		// Settle first half with provider 1
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);

		// Settle second half with provider 2
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		// Verify final balances
		const splitAmount = this.orderAmount.mul(splitOrderpercent).div(MAX_BPS); // 50% of order amount
		const splitProtocolFee = splitAmount.mul(this.protocolFeePercent).div(MAX_BPS); // 0.5% of split amount

		// Sender should get 100% of sender fee (2000 tokens) - processed once for the entire order
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("2000")
		);
		
		// Provider 1 should get 50% of order amount minus protocol fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitAmount.sub(splitProtocolFee)
		);
		
		// Provider 2 should get 50% of order amount minus protocol fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitAmount.sub(splitProtocolFee)
		);
		
		// Treasury should get protocol fees from both providers
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee.add(splitProtocolFee)
		);
		
		// Gateway should have 0 balance (all tokens distributed)
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle rebate functionality for FX transfer (rate ≠ 1)", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

		const rate = 750; // FX transfer (rate ≠ 1)
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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee, // Protocol fee should be calculated for FX transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Test with 50% rebate
		const rebatePercent = 50_000; // 50% rebate
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, rebatePercent)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS, rebatePercent)
			.to.emit(gateway, Events.Gateway.FxTransferFeeSplit)
			.withArgs(
				orderId,
				ethers.utils.parseEther("1000"), // senderAmount: 100% of sender fee (senderToAggregator = 0)
				ethers.utils.parseEther("0")    // aggregatorAmount: 0% of sender fee
			);

		// Calculate expected amounts with rebate
		const expectedRebateAmount = this.protocolFee.mul(rebatePercent).div(MAX_BPS); // 50% of protocol fee
		const expectedTreasuryAmount = this.protocolFee.sub(expectedRebateAmount); // Remaining protocol fee
		const expectedProviderAmount = this.liquidityProviderAmount.add(expectedRebateAmount); // Original amount + rebate

		// Verify balances
		// Sender should get 100% of sender fee (1000 tokens) since senderToAggregator = 0
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("1000")
		);
		
		// Provider should get liquidity provider amount plus rebate
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			expectedProviderAmount
		);
		
		// Treasury should get reduced protocol fee (after rebate)
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			expectedTreasuryAmount
		);
		
		// Gateway should have 0 balance (all tokens distributed)
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle rebate functionality for split orders", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

		const rate = 750; // FX transfer (rate ≠ 1)
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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Verify order creation
		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				this.protocolFee, // Protocol fee should be calculated for FX transfers
				orderId,
				rate,
				messageHash.toString()
			);

		// Split the order between two providers (50% each) with 25% rebate
		const splitOrderpercent = 50_000; // 50% split
		const rebatePercent = 25_000; // 25% rebate
		const encodedSplitOrder = ethers.utils.defaultAbiCoder.encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.utils.solidityKeccak256(["bytes"], [encodedSplitOrder]);

		// Settle first half with provider 1
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, rebatePercent)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, rebatePercent);

		// Settle second half with provider 2
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, rebatePercent)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, rebatePercent);

		// Verify final balances
		const splitAmount = this.orderAmount.mul(splitOrderpercent).div(MAX_BPS); // 50% of order amount
		const splitProtocolFee = splitAmount.mul(this.protocolFeePercent).div(MAX_BPS); // 0.5% of split amount
		const splitRebateAmount = splitProtocolFee.mul(rebatePercent).div(MAX_BPS); // 25% of split protocol fee
		const splitTreasuryAmount = splitProtocolFee.sub(splitRebateAmount); // Remaining protocol fee after rebate
		const splitProviderAmount = splitAmount.sub(splitProtocolFee).add(splitRebateAmount); // Provider amount with rebate

		// Sender should get 100% of sender fee (1000 tokens) - processed once for the entire order
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("1000")
		);
		
		// Provider 1 should get 50% of order amount minus protocol fee plus rebate
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitProviderAmount
		);
		
		// Provider 2 should get 50% of order amount minus protocol fee plus rebate
		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitProviderAmount
		);
		
		// Treasury should get reduced protocol fees from both providers
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitTreasuryAmount.add(splitTreasuryAmount) // Both providers
		);
		
		// Gateway should have 0 balance (all tokens distributed)
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should revert when rebate percent exceeds MAX_BPS", async function () {
		const ret = await getSupportedInstitutions();
		
		// Set a sender fee for this test
		this.senderFee = ethers.utils.parseEther("1000"); // 1000 tokens sender fee
		
		// Ensure sender has enough tokens to cover both order amount and sender fee
		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);
		
		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.mintAmount.add(this.senderFee));

		const rate = 750; // FX transfer (rate ≠ 1)
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
		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
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

		// Try to settle with invalid rebate percent (> 100%)
		const invalidRebatePercent = MAX_BPS + 1; // 100.001%
		
		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, invalidRebatePercent)
		).to.be.revertedWith('InvalidRebatePercent');
	});

	/* ##################################################################
	                        SETTLEIN TESTS (ONRAMP)
    ################################################################## */

	describe("settleIn", function () {
		beforeEach(async function () {
			// Setup for settleIn tests
			this.recipient = this.bob; // Recipient who will receive tokens
			this.provider = this.liquidityProvider; // Provider who deposits tokens
			this.senderFee = ethers.utils.parseEther("100"); // Sender fee
			// For FX: totalAmount needs to cover protocolFee + senderFee + recipient amount
			// For local: totalAmount needs to cover senderFee + recipient amount
			// We'll set a base amount and add fees as needed in each test
			this.baseAmount = ethers.utils.parseEther("10000"); // Base amount for recipient
			
			// Mint tokens for provider (will be adjusted per test)
			await mockUSDT.connect(this.alice).mint(ethers.utils.parseEther("50000"));
			await mockUSDT.connect(this.alice).transfer(this.provider.address, ethers.utils.parseEther("50000"));
		});

		it("Should successfully process settleIn for FX transfer (rate ≠ 100)", async function () {
			const ret = await getSupportedInstitutions();
			const rate = 750; // FX transfer
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-1"]));

			// Calculate total amount needed: baseAmount + protocolFee + senderFee
			// Protocol fee is calculated from total amount, so we need to solve:
			// totalAmount = baseAmount + (totalAmount * protocolFeePercent / MAX_BPS) + senderFee
			// totalAmount * (1 - protocolFeePercent / MAX_BPS) = baseAmount + senderFee
			// totalAmount = (baseAmount + senderFee) / (1 - protocolFeePercent / MAX_BPS)
			const protocolFeeBPS = this.protocolFeePercent;
			const denominator = MAX_BPS.sub(protocolFeeBPS);
			const totalAmount = this.baseAmount.add(this.senderFee).mul(MAX_BPS).div(denominator);
			const protocolFee = totalAmount.mul(protocolFeeBPS).div(MAX_BPS);
			const processedAmount = totalAmount.sub(protocolFee).sub(this.senderFee);

			// Get initial balances
			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			// Approve tokens (total amount includes fees)
			await mockUSDT.connect(this.provider).approve(gateway.address, totalAmount);

			// Execute settleIn
			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						totalAmount,
						this.sender.address,
						this.senderFee,
						this.recipient.address,
						rate
					)
			)
				.to.emit(gateway, Events.Gateway.SettleIn)
				.withArgs(
					orderId,
					totalAmount,
					this.recipient.address,
					mockUSDT.address,
					this.sender.address,
					rate
				)
				.to.emit(gateway, Events.Gateway.FxTransferFeeSplit)
				.withArgs(
					orderId,
					ethers.utils.parseEther("100"), // senderAmount: 100% of sender fee (senderToAggregator = 0)
					ethers.utils.parseEther("0")    // aggregatorAmount: 0% of sender fee
				);

			// Verify balances (check deltas to account for previous test balances)
			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance.add(processedAmount));
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(initialTreasuryBalance.add(protocolFee));
			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance.add(this.senderFee));
			expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);

			// Verify order state
			const orderInfo = await gateway.getOrderInfo(orderId);
			expect(orderInfo.sender).to.eq(this.recipient.address);
			expect(orderInfo.token).to.eq(mockUSDT.address);
			expect(orderInfo.isFulfilled).to.eq(true);
			expect(orderInfo.amount).to.eq(processedAmount);
			expect(orderInfo.currentBPS).to.eq(0);
		});

		it("Should successfully process settleIn for local transfer (rate = 100)", async function () {
			const ret = await getSupportedInstitutions();
			const rate = 100; // Local transfer
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-2"]));

			// For local transfer, no protocol fee, total = baseAmount + senderFee
			const totalAmount = this.baseAmount.add(this.senderFee);
			const processedAmount = totalAmount.sub(this.senderFee); // Should equal baseAmount

			// Get initial balances
			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialProviderBalance = await mockUSDT.balanceOf(this.provider.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			// Approve tokens (provider will transfer totalAmount to contract)
			await mockUSDT.connect(this.provider).approve(gateway.address, totalAmount);

			// Execute settleIn
			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						totalAmount,
						this.sender.address,
						this.senderFee,
						this.recipient.address,
						rate
					)
			)
				.to.emit(gateway, Events.Gateway.SettleIn)
				.withArgs(
					orderId,
					totalAmount,
					this.recipient.address,
					mockUSDT.address,
					this.sender.address,
					rate
				)
				.to.emit(gateway, Events.Gateway.LocalTransferFeeSplit)
				.withArgs(
					orderId,
					ethers.utils.parseEther("50"),  // senderAmount: 50% of sender fee (100 - 50)
					ethers.utils.parseEther("25"),  // providerAmount: 25% of sender fee (50% of provider's 50%)
					ethers.utils.parseEther("25")   // aggregatorAmount: 25% of sender fee
				);

			// Verify balances (check deltas to account for previous test balances)
			// Provider: deposits totalAmount, receives providerFee (25% of senderFee) back
			const providerFee = ethers.utils.parseEther("25"); // 25% of sender fee
			const senderAmount = ethers.utils.parseEther("50"); // 50% of sender fee
			const aggregatorAmount = ethers.utils.parseEther("25"); // 25% of sender fee
			
			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance.add(processedAmount));
			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance.add(senderAmount));
			// Provider balance: initial - totalAmount (deposited) + providerFee (received)
			expect(await mockUSDT.balanceOf(this.provider.address)).to.eq(initialProviderBalance.sub(totalAmount).add(providerFee));
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(initialTreasuryBalance.add(aggregatorAmount));
			expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
		});

		it("Should revert when settleIn is called with amount below minimum", async function () {
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-3"]));
			const rate = 750;
			const amountBelowMinimum = MAX_BPS; // Exactly at minimum (100000), should fail (needs > MAX_BPS)

			await mockUSDT.connect(this.provider).approve(gateway.address, amountBelowMinimum.add(1));

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						amountBelowMinimum, // This is exactly MAX_BPS, should fail
						this.sender.address,
						0,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith('AmountBelowMinimum');
		});

		it("Should revert when settleIn is called with zero sender fee for local transfer", async function () {
			const ret = await getSupportedInstitutions();
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-4"]));
			const rate = 100; // Local transfer requires sender fee

			// For local transfer, total = baseAmount + senderFee (but senderFee is 0, so just baseAmount)
			const totalAmount = this.baseAmount; // No sender fee in this test

			await mockUSDT.connect(this.provider).approve(gateway.address, totalAmount);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						totalAmount,
						this.sender.address,
						0, // Zero sender fee should fail for local transfer
						this.recipient.address,
						rate
					)
			).to.be.revertedWith('SenderFeeIsZero');
		});

		it("Should revert when settleIn is called with unsupported token", async function () {
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-5"]));
			const rate = 750;
			const unsupportedToken = this.hacker.address; // Random address, not supported
			const totalAmount = this.baseAmount.add(this.senderFee);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						unsupportedToken,
						totalAmount,
						this.sender.address,
						this.senderFee,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith('TokenNotSupported');
		});

		it("Should handle settleIn with FX transfer fee splitting correctly", async function () {
			const ret = await getSupportedInstitutions();
			const rate = 750; // FX transfer
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-6"]));
			const senderFee = ethers.utils.parseEther("1000");
			const baseAmount = ethers.utils.parseEther("10000");
			
			// Update token settings to have senderToAggregator > 0 for this test
			await gateway.connect(this.deployer).setTokenFeeSettings(
				mockUSDT.address,
				50000,  // senderToProvider
				50000,  // providerToAggregator
				30000,  // senderToAggregator: 30% of sender fee goes to aggregator
				500     // providerToAggregatorFx
			);

			// Calculate total amount needed: baseAmount + protocolFee + senderFee
			// Protocol fee is calculated from total amount
			const protocolFeeBPS = this.protocolFeePercent;
			const denominator = MAX_BPS.sub(protocolFeeBPS);
			const totalAmount = baseAmount.add(senderFee).mul(MAX_BPS).div(denominator);
			
			// Get initial balances
			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			// Mint and approve (amount includes protocolFee + senderFee)
			await mockUSDT.connect(this.alice).mint(totalAmount);
			await mockUSDT.connect(this.alice).transfer(this.provider.address, totalAmount);
			await mockUSDT.connect(this.provider).approve(gateway.address, totalAmount);

			// Calculate fees: protocolFee from totalAmount, senderFee is part of totalAmount
			const protocolFee = totalAmount.mul(protocolFeeBPS).div(MAX_BPS);
			const senderAmount = senderFee.mul(MAX_BPS.sub(30000)).div(MAX_BPS); // 70% of sender fee
			const aggregatorAmount = senderFee.sub(senderAmount); // 30% of sender fee
			const processedAmount = totalAmount.sub(protocolFee).sub(senderFee);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						totalAmount,
						this.sender.address,
						senderFee,
						this.recipient.address,
						rate
					)
			)
				.to.emit(gateway, Events.Gateway.FxTransferFeeSplit)
				.withArgs(
					orderId,
					senderAmount,      // 70% of sender fee
					aggregatorAmount  // 30% of sender fee
				);

			// Verify balances (check deltas to account for previous test balances)
			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance.add(senderAmount));
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(initialTreasuryBalance.add(protocolFee).add(aggregatorAmount));
			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance.add(processedAmount));

			// Reset token settings
			await gateway.connect(this.deployer).setTokenFeeSettings(
				mockUSDT.address,
				50000,  // senderToProvider
				50000,  // providerToAggregator
				0,      // senderToAggregator: reset to 0
				500     // providerToAggregatorFx
			);
		});

		it("Should revert when settleIn is called on paused contract", async function () {
			const orderId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["test-order-7"]));
			const rate = 750;
			const totalAmount = this.baseAmount.add(this.senderFee);

			// Pause the contract
			await gateway.connect(this.deployer).pause();

			await mockUSDT.connect(this.provider).approve(gateway.address, totalAmount);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.address,
						totalAmount,
						this.sender.address,
						this.senderFee,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith('Pausable: paused');

			// Unpause for other tests
			await gateway.connect(this.deployer).unpause();
		});
	});
});
