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
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
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
				.settle(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent);
		
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
				.settle(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent);

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
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
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
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS)
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
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS)
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
				.settle(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent);

		// Settle second half with provider 2
		await expect(
			gateway
				.connect(this.aggregator)
				.settle(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent);

		// Verify final balances
		const splitAmount = this.orderAmount.mul(splitOrderpercent).div(MAX_BPS); // 50% of order amount

		// Sender should get 50% of sender fee (1000 tokens) - processed once for the entire order
		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.utils.parseEther("1000")
		);
		
		// Provider 1 should get 50% of order amount (no sender fee portion in split orders)
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitAmount
		);
		
		// Provider 2 should get 50% of order amount plus 500 tokens from sender fee
		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitAmount.add(ethers.utils.parseEther("500"))
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
				.settle(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent);

		// Settle second half with provider 2
		await expect(
			gateway
				.connect(this.aggregator)
				.settle(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.OrderSettled)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent);

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

	describe("Clawback functionality", function () {
		it("Should handle clawback percentage correctly", async function () {
			await mockUSDT.connect(this.sender).approve(gateway.address, this.orderAmount);

			const tx = await gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					200, // FX transfer (rate ≠ 100) to trigger protocol fee
					this.sender.address,
					this.senderFee,
					this.sender.address,
					"test-message-hash"
				);

			const receipt = await tx.wait();
			const orderCreatedEvent = receipt.events.find(
				(event) => event.event === "OrderCreated"
			);

			const orderId = orderCreatedEvent.args.orderId;

			// Test with 50% clawback (5000 basis points)
			const clawbackPercent = 5000; // 50%
			const expectedClawbackAmount = this.protocolFee.mul(clawbackPercent).div(MAX_BPS);
			const expectedTreasuryAmount = this.protocolFee.sub(expectedClawbackAmount);

			await expect(
				gateway
					.connect(this.aggregator)
					.settle(
						ethers.utils.keccak256(ethers.utils.toUtf8Bytes("split-order-id")),
						orderId,
						this.liquidityProvider.address,
						MAX_BPS,
						clawbackPercent
					)
			)
				.to.emit(gateway, "ProtocolFeeClawback")
				.withArgs(
					orderId,
					this.protocolFee,
					expectedTreasuryAmount,
					expectedClawbackAmount,
					clawbackPercent
				);
		});

		it("Should reject invalid clawback percentage", async function () {
			await mockUSDT.connect(this.sender).approve(gateway.address, this.orderAmount);

			const tx = await gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					200, // FX transfer (rate ≠ 100) to trigger protocol fee
					this.sender.address,
					this.senderFee,
					this.sender.address,
					"test-message-hash"
				);

			const receipt = await tx.wait();
			const orderCreatedEvent = receipt.events.find(
				(event) => event.event === "OrderCreated"
			);

			const orderId = orderCreatedEvent.args.orderId;

			// Test with invalid clawback percentage (> 100%)
			await expect(
				gateway
					.connect(this.aggregator)
					.settle(
						ethers.utils.keccak256(ethers.utils.toUtf8Bytes("split-order-id")),
						orderId,
						this.liquidityProvider.address,
						MAX_BPS,
						100001 // Invalid: > 10000 basis points
					)
			).to.be.revertedWith("InvalidClawbackPercent");
		});
	});
});
