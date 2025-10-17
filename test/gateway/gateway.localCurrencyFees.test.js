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

describe("Gateway Local Currency Fee Splitting", function () {
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
			this.senderFeeRecipient,
			this.hacker,
			...this.accounts
		] = await ethers.getSigners();

		({ gateway, mockUSDT } = await gatewayFixture());

		this.mintAmount = ethers.utils.parseEther("100000");
		this.orderAmount = ethers.utils.parseEther("10000");
		this.senderFee = ethers.utils.parseEther("100"); // 100 tokens as sender fee
		
		// Set protocol fee to 1% (1000 BPS out of 100,000)
		this.protocolFeePercent = BigNumber.from(1000);

		await expect(
			gateway.connect(this.deployer).updateProtocolFee(this.protocolFeePercent)
		)
			.to.emit(gateway, Events.Gateway.ProtocolFeeUpdated)
			.withArgs(this.protocolFeePercent);

		await gateway.connect(this.deployer).updateLocalCurrencyProviderFee(50000);

		await mockUSDT.connect(this.alice).mint(this.mintAmount);
		await mockUSDT
			.connect(this.alice)
			.transfer(this.sender.address, this.mintAmount);

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

		const token = ethers.utils.formatBytes32String("token");
		await expect(
			gateway
				.connect(this.deployer)
				.settingManagerBool(token, mockUSDT.address, BigNumber.from(1))
		)
			.to.emit(gateway, Events.Gateway.SettingManagerBool)
			.withArgs(token, mockUSDT.address, BigNumber.from(1));
	});

	it("Should split fees correctly for local currency (rate = 100) with single settlement", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.orderAmount.add(this.senderFee));

		const rate = 100; // Local currency rate 1:1

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

		const argOrderID = [this.sender.address, 1, 31337]; // Include chainId

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

		// Create order with local currency rate
		await expect(
			gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					rate,
					this.senderFeeRecipient.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				0, // Protocol fee should be 0 for local currency
				orderId,
				rate,
				messageHash.toString()
			);

		// Check initial balances
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(0);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(0);
		expect(await mockUSDT.balanceOf(this.senderFeeRecipient.address)).to.eq(0);

		// Settle the full order (100%)
		await expect(
			gateway
				.connect(this.aggregator)
				.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS)
		).to.emit(gateway, Events.Gateway.OrderSettled);

		// Calculate expected values
		// Sender fee is split 50-50: 50 tokens to provider, 50 tokens to sender fee recipient
		const providerFeeFromSender = this.senderFee.div(2); // 50 tokens
		const senderFeeForRecipient = this.senderFee.div(2); // 50 tokens
		
		// Protocol fee is 1% of provider's portion: 1% of 50 = 0.5 tokens
		const protocolFeeFromProvider = providerFeeFromSender.mul(this.protocolFeePercent).div(MAX_BPS);
		const netProviderFee = providerFeeFromSender.sub(protocolFeeFromProvider);

		// Check final balances
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.orderAmount.add(netProviderFee) // Order amount + net provider fee
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			protocolFeeFromProvider // Protocol fee from provider's portion
		);
		expect(await mockUSDT.balanceOf(this.senderFeeRecipient.address)).to.eq(
			senderFeeForRecipient // 50% of sender fee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(0);

		// Verify the fee calculations are correct
		expect(providerFeeFromSender).to.eq(ethers.utils.parseEther("50"), "Provider should get 50% of sender fee");
		expect(senderFeeForRecipient).to.eq(ethers.utils.parseEther("50"), "Sender recipient should get 50% of sender fee");
		expect(protocolFeeFromProvider).to.eq(ethers.utils.parseEther("0.5"), "Protocol fee should be 1% of provider portion");
		expect(netProviderFee).to.eq(ethers.utils.parseEther("49.5"), "Net provider fee should be provider fee minus protocol fee");
	});

	it("Should split fees correctly for local currency with multiple settlements", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.orderAmount.add(this.senderFee));

		const rate = 100; // Local currency rate 1:1

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

		const argOrderID = [this.sender.address, 1, 31337];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

		// Create order with local currency rate
		await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.address,
				this.orderAmount,
				rate,
				this.senderFeeRecipient.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		// Verify initial state
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(this.orderAmount.add(this.senderFee));
		
		let orderInfo = await gateway.getOrderInfo(orderId);
		expect(orderInfo.amount).to.eq(this.orderAmount);
		expect(orderInfo.senderFee).to.eq(this.senderFee);
		expect(orderInfo.protocolFee).to.eq(0); // Should be 0 for local currency

		// First settlement: 60% of the order
		const firstSettlePercent = 60_000; // 60%
		const splitOrderId1 = ethers.utils.solidityKeccak256(["bytes"], [
			ethers.utils.defaultAbiCoder.encode(["uint256"], [firstSettlePercent])
		]);

		await gateway
			.connect(this.aggregator)
			.settle(splitOrderId1, orderId, this.liquidityProvider.address, firstSettlePercent);

		// Calculate expected values for first settlement
		const firstOrderAmount = this.orderAmount.mul(firstSettlePercent).div(MAX_BPS); // 6000 tokens
		const totalProviderFee = this.senderFee.div(2); // 50 tokens total for all providers
		const firstProviderFee = totalProviderFee.mul(firstSettlePercent).div(MAX_BPS); // 30 tokens
		const firstProtocolFee = firstProviderFee.mul(this.protocolFeePercent).div(MAX_BPS); // 0.3 tokens
		const firstNetProviderFee = firstProviderFee.sub(firstProtocolFee); // 29.7 tokens

		// Verify balances after first settlement
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			firstOrderAmount.add(firstNetProviderFee), "Provider 1 should get order amount + net provider fee"
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			firstProtocolFee, "Treasury should get protocol fee from provider's portion"
		);
		
		orderInfo = await gateway.getOrderInfo(orderId);
		expect(orderInfo.amount).to.eq(this.orderAmount.sub(firstOrderAmount), "Remaining order amount should be correct");
		expect(orderInfo.senderFee).to.eq(this.senderFee, "Sender fee should remain unchanged");
		expect(orderInfo.currentBPS).to.eq(MAX_BPS - firstSettlePercent, "Current BPS should be updated");
		expect(orderInfo.isFulfilled).to.be.false;

		// Second settlement: 40% of the original order
		const secondSettlePercent = 40_000; // 40%
		const splitOrderId2 = ethers.utils.solidityKeccak256(["bytes"], [
			ethers.utils.defaultAbiCoder.encode(["uint256"], [secondSettlePercent])
		]);

		await gateway
			.connect(this.aggregator)
			.settle(splitOrderId2, orderId, this.liquidityProvider2.address, secondSettlePercent);

		// Calculate expected values for second settlement
		const secondOrderAmount = this.orderAmount.mul(secondSettlePercent).div(MAX_BPS); // 4000 tokens
		const secondProviderFee = totalProviderFee.mul(secondSettlePercent).div(MAX_BPS); // 20 tokens
		const secondProtocolFee = secondProviderFee.mul(this.protocolFeePercent).div(MAX_BPS); // 0.2 tokens
		const secondNetProviderFee = secondProviderFee.sub(secondProtocolFee); // 19.8 tokens
		const senderFeeForRecipient = this.senderFee.div(2); // 50 tokens

		// Verify balances after second settlement (order completion)
		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			secondOrderAmount.add(secondNetProviderFee), "Provider 2 should get order amount + net provider fee"
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			firstProtocolFee.add(secondProtocolFee), "Treasury should get total protocol fees"
		);
		expect(await mockUSDT.balanceOf(this.senderFeeRecipient.address)).to.eq(
			senderFeeForRecipient, "Sender fee recipient should get their 50% share"
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(0, "Contract should have no remaining balance");

		// Verify final order state
		orderInfo = await gateway.getOrderInfo(orderId);
		expect(orderInfo.amount).to.eq(0, "Order amount should be fully settled");
		expect(orderInfo.currentBPS).to.eq(0, "Current BPS should be 0");
		expect(orderInfo.isFulfilled).to.be.true;

		// Verify fee distribution math
		const totalDistributed = firstOrderAmount.add(secondOrderAmount)
			.add(firstNetProviderFee).add(secondNetProviderFee)
			.add(firstProtocolFee).add(secondProtocolFee)
			.add(senderFeeForRecipient);
		
		expect(totalDistributed).to.eq(
			this.orderAmount.add(this.senderFee), 
			"Total distributed should equal total received by contract"
		);
	});

	it("Should handle regular currency (rate != 100) without fee splitting", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.address, this.orderAmount.add(this.senderFee));

		const rate = 750; // Regular currency rate (not 1:1)

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

		const argOrderID = [this.sender.address, 1, 31337];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

		// For regular currency, protocol fee should be calculated normally
		const expectedProtocolFee = this.orderAmount.mul(this.protocolFeePercent).div(MAX_BPS);

		// Create order with regular currency rate
		await expect(
			gateway
				.connect(this.sender)
				.createOrder(
					mockUSDT.address,
					this.orderAmount,
					rate,
					this.senderFeeRecipient.address,
					this.senderFee,
					this.alice.address,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.address,
				this.orderAmount,
				expectedProtocolFee, // Protocol fee should be calculated for regular currency
				orderId,
				rate,
				messageHash.toString()
			);

		// Settle the full order
		await gateway
			.connect(this.aggregator)
			.settle(orderId, orderId, this.liquidityProvider.address, MAX_BPS);

		// For regular currency: no fee splitting, full sender fee goes to recipient
		const expectedLiquidityProviderAmount = this.orderAmount.sub(expectedProtocolFee);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			expectedLiquidityProviderAmount // No additional fees from sender fee
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			expectedProtocolFee // Protocol fee from order amount
		);
		expect(await mockUSDT.balanceOf(this.senderFeeRecipient.address)).to.eq(
			this.senderFee // Full sender fee
		);

		// Verify order is fulfilled
		const finalOrderInfo = await gateway.getOrderInfo(orderId);
		expect(finalOrderInfo.isFulfilled).to.be.true;
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(0);

		// Verify calculations
		expect(expectedProtocolFee).to.eq(this.orderAmount.mul(this.protocolFeePercent).div(MAX_BPS));
		expect(expectedLiquidityProviderAmount).to.eq(this.orderAmount.sub(expectedProtocolFee));
	});
});