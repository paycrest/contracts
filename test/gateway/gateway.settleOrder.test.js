import CryptoJS from "crypto-js";
import { expect } from "chai";
import { ethers } from "../setup.js";
import { gatewayFixture } from "../fixtures/gateway.js";
import {
	ZERO_AMOUNT,
	FEE_BPS,
	MAX_BPS,
	Events,
	getSupportedInstitutions,
} from "../utils/utils.manager.js";

function parseOrderId(gateway, receipt) {
	return receipt.logs
		.map(log => { try { return gateway.interface.parseLog(log); } catch { return null; } })
		.find(e => e?.name === "OrderCreated")
		?.args.orderId;
}

describe("Gateway settle order", function () {
	let gateway, mockUSDT;

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

		this.mintAmount = ethers.parseEther("27000000");
		this.orderAmount = ethers.parseEther("27000000");
		this.senderFee = ethers.parseEther("0");

		this.protocolFeePercent = 500n;
		this.protocolFee = ethers.parseEther("135000");

		this.liquidityProviderAmount = this.orderAmount - this.protocolFee;

		await mockUSDT.connect(this.alice).mint(this.mintAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(this.mintAmount);
		await mockUSDT
			.connect(this.alice)
			.transfer(this.sender.address, this.mintAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(ZERO_AMOUNT);
		expect(await mockUSDT.balanceOf(this.aggregator.address)).to.eq(ZERO_AMOUNT);
		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(ZERO_AMOUNT);

		const treasury = ethers.encodeBytes32String("treasury");

		await expect(
			gateway
				.connect(this.deployer)
				.updateProtocolAddress(treasury, this.treasuryAddress.address)
		).to.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

		const aggregator = ethers.encodeBytes32String("aggregator");

		await expect(
			gateway
				.connect(this.deployer)
				.updateProtocolAddress(aggregator, this.aggregator.address)
		).to.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.target)
		).to.equal(ZERO_AMOUNT);
	});

	it("Should be able to create order by the sender and settled by the liquidity aggregator", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount);

		expect(
			await mockUSDT.allowance(this.sender.address, gateway.target)
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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
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
		expect(this.token).to.eq(mockUSDT.target);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(this.orderAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.target)
		).to.equal(ZERO_AMOUNT);

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
		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should be able to create order by the sender and split the order", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount);

		expect(
			await mockUSDT.allowance(this.sender.address, gateway.target)
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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
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
		expect(this.token).to.eq(mockUSDT.target);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(this.orderAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.target)
		).to.equal(ZERO_AMOUNT);

		const splitOrderpercent = 50_000n;
		const encodedSplitOrder = ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.keccak256(encodedSplitOrder);

		console.log(await mockUSDT.balanceOf(this.liquidityProvider.address));

		expect(
			await gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);

		const splitLiquidityProviderAmount = this.orderAmount * splitOrderpercent / MAX_BPS;
		const splitProtocolFee = splitLiquidityProviderAmount * this.protocolFeePercent / MAX_BPS;

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitLiquidityProviderAmount - splitProtocolFee
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(splitLiquidityProviderAmount);

		expect(
			await gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		).to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		const splitProtocolFeeSplitedOrder = splitLiquidityProviderAmount * this.protocolFeePercent / MAX_BPS;

		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitLiquidityProviderAmount - splitProtocolFeeSplitedOrder
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee + splitProtocolFeeSplitedOrder
		);
		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(0n);
	});

	it("Should revert when trying to settle an already fulfilled order", async function () {
		const ret = await getSupportedInstitutions();

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount);

		expect(
			await mockUSDT.allowance(this.sender.address, gateway.target)
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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
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
		expect(this.token).to.eq(mockUSDT.target);
		expect(this.isFulfilled).to.eq(false);
		expect(this.isRefunded).to.eq(false);
		expect(this.refundAddress).to.eq(this.alice.address);
		expect(this.currentBPS).to.eq(MAX_BPS);
		expect(this.amount).to.eq(this.orderAmount);

		expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

		expect(
			await mockUSDT.allowance(this.alice.address, gateway.target)
		).to.equal(ZERO_AMOUNT);

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

		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle local transfer fee splitting (rate = 1) with sender fee", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("1000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

		const rate = 100;
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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				ZERO_AMOUNT,
				orderId,
				rate,
				messageHash.toString()
			);

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
				ethers.parseEther("500"),
				ethers.parseEther("250"),
				ethers.parseEther("250")
			);

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("500")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.orderAmount + ethers.parseEther("250")
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			ethers.parseEther("250")
		);
	});

	it("Should handle FX transfer fee splitting (rate ≠ 1) with sender fee", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("1000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

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
				ethers.parseEther("1000"),
				ethers.parseEther("0")
			);

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("1000")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			this.liquidityProviderAmount
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
	});

	it("Should handle split order with sender fee for local transfer (rate = 1)", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("2000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

		const rate = 100;
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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				ZERO_AMOUNT,
				orderId,
				rate,
				messageHash.toString()
			);

		const splitOrderpercent = 50_000n;
		const encodedSplitOrder = ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.keccak256(encodedSplitOrder);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		const splitAmount = this.orderAmount * splitOrderpercent / MAX_BPS;

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("1000")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitAmount + ethers.parseEther("250")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitAmount + ethers.parseEther("250")
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			ethers.parseEther("500")
		);

		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle split order with sender fee for FX transfer (rate ≠ 1)", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("2000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

		const splitOrderpercent = 50_000n;
		const encodedSplitOrder = ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.keccak256(encodedSplitOrder);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, 0);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, 0);

		const splitAmount = this.orderAmount * splitOrderpercent / MAX_BPS;
		const splitProtocolFee = splitAmount * this.protocolFeePercent / MAX_BPS;

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("2000")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitAmount - splitProtocolFee
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitAmount - splitProtocolFee
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitProtocolFee + splitProtocolFee
		);

		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle rebate functionality for FX transfer (rate ≠ 1)", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("1000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

		const rebatePercent = 50_000n;
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
				ethers.parseEther("1000"),
				ethers.parseEther("0")
			);

		const expectedRebateAmount = this.protocolFee * rebatePercent / MAX_BPS;
		const expectedTreasuryAmount = this.protocolFee - expectedRebateAmount;
		const expectedProviderAmount = this.liquidityProviderAmount + expectedRebateAmount;

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("1000")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			expectedProviderAmount
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			expectedTreasuryAmount
		);

		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should handle rebate functionality for split orders", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("1000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		await expect(tx)
			.to.emit(gateway, Events.Gateway.OrderCreated)
			.withArgs(
				this.alice.address,
				mockUSDT.target,
				this.orderAmount,
				this.protocolFee,
				orderId,
				rate,
				messageHash.toString()
			);

		const splitOrderpercent = 50_000n;
		const rebatePercent = 25_000n;
		const encodedSplitOrder = ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256"],
			[splitOrderpercent]
		);
		const splitOrderId = ethers.keccak256(encodedSplitOrder);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, rebatePercent)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider.address, splitOrderpercent, rebatePercent);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, rebatePercent)
		)
			.to.emit(gateway, Events.Gateway.SettleOut)
			.withArgs(splitOrderId, orderId, this.liquidityProvider2.address, splitOrderpercent, rebatePercent);

		const splitAmount = this.orderAmount * splitOrderpercent / MAX_BPS;
		const splitProtocolFee = splitAmount * this.protocolFeePercent / MAX_BPS;
		const splitRebateAmount = splitProtocolFee * rebatePercent / MAX_BPS;
		const splitTreasuryAmount = splitProtocolFee - splitRebateAmount;
		const splitProviderAmount = splitAmount - splitProtocolFee + splitRebateAmount;

		expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(
			ethers.parseEther("1000")
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
			splitProviderAmount
		);

		expect(await mockUSDT.balanceOf(this.liquidityProvider2.address)).to.eq(
			splitProviderAmount
		);

		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			splitTreasuryAmount + splitTreasuryAmount
		);

		expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
	});

	it("Should revert when rebate percent exceeds MAX_BPS", async function () {
		const ret = await getSupportedInstitutions();

		this.senderFee = ethers.parseEther("1000");

		await mockUSDT.connect(this.alice).mint(this.senderFee);
		await mockUSDT.connect(this.alice).transfer(this.sender.address, this.senderFee);

		await mockUSDT
			.connect(this.sender)
			.approve(gateway.target, this.mintAmount + this.senderFee);

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

		const tx = await gateway
			.connect(this.sender)
			.createOrder(
				mockUSDT.target,
				this.orderAmount,
				rate,
				this.sender.address,
				this.senderFee,
				this.alice.address,
				messageHash.toString()
			);

		const receipt = await tx.wait();
		const orderId = parseOrderId(gateway, receipt);

		const invalidRebatePercent = MAX_BPS + 1n;

		await expect(
			gateway
				.connect(this.aggregator)
				.settleOut(orderId, orderId, this.liquidityProvider.address, MAX_BPS, invalidRebatePercent)
		).to.be.revertedWith("InvalidRebatePercent");
	});

	/* ##################################################################
	                        SETTLEIN TESTS (ONRAMP)
    ################################################################## */

	describe("settleIn", function () {
		beforeEach(async function () {
			this.recipient = this.bob;
			this.provider = this.liquidityProvider;
			this.senderFee = ethers.parseEther("100");
			this.baseAmount = ethers.parseEther("10000");

			await mockUSDT.connect(this.alice).mint(ethers.parseEther("50000"));
			await mockUSDT.connect(this.alice).transfer(this.provider.address, ethers.parseEther("50000"));
		});

		it("Should successfully process settleIn for FX transfer (rate ≠ 100)", async function () {
			const rate = 750;
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-1"]));

			const totalAmount = this.baseAmount;
			const protocolFee = totalAmount * this.protocolFeePercent / MAX_BPS;
			const senderAmount = totalAmount - protocolFee;

			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			await mockUSDT.connect(this.provider).approve(gateway.target, totalAmount + this.senderFee);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
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
					this.provider.address,
					this.recipient.address,
					senderAmount,
					mockUSDT.target,
					protocolFee,
					rate
				)
				.to.emit(gateway, Events.Gateway.FxTransferFeeSplit)
				.withArgs(
					orderId,
					ethers.parseEther("100"),
					ethers.parseEther("0")
				);

			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance + senderAmount);
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(initialTreasuryBalance + protocolFee);
			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance + this.senderFee);
			expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);

			const orderInfo = await gateway.getOrderInfo(orderId);
			expect(orderInfo.sender).to.eq(this.recipient.address);
			expect(orderInfo.token).to.eq(mockUSDT.target);
			expect(orderInfo.isFulfilled).to.eq(true);
			expect(orderInfo.amount).to.eq(senderAmount);
			expect(orderInfo.currentBPS).to.eq(0n);
		});

		it("Should successfully process settleIn for local transfer (rate = 100)", async function () {
			const rate = 100;
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-2"]));

			const totalAmount = this.baseAmount;
			const senderAmount = totalAmount;

			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialProviderBalance = await mockUSDT.balanceOf(this.provider.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			await mockUSDT.connect(this.provider).approve(gateway.target, totalAmount + this.senderFee);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
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
					this.provider.address,
					this.recipient.address,
					senderAmount,
					mockUSDT.target,
					ZERO_AMOUNT,
					rate
				)
				.to.emit(gateway, Events.Gateway.LocalTransferFeeSplit)
				.withArgs(
					orderId,
					ethers.parseEther("50"),
					ethers.parseEther("25"),
					ethers.parseEther("25")
				);

			const providerFee = ethers.parseEther("25");
			const senderFeeAmount = ethers.parseEther("50");
			const aggregatorAmount = ethers.parseEther("25");

			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance + senderAmount);
			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance + senderFeeAmount);
			expect(await mockUSDT.balanceOf(this.provider.address)).to.eq(
				initialProviderBalance - (totalAmount + this.senderFee) + providerFee
			);
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(initialTreasuryBalance + aggregatorAmount);
			expect(await mockUSDT.balanceOf(gateway.target)).to.eq(ZERO_AMOUNT);
		});

		it("Should revert when settleIn is called with zero amount", async function () {
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-3"]));
			const rate = 750;

			await mockUSDT.connect(this.provider).approve(gateway.target, 1n);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
						0n,
						this.sender.address,
						0n,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith("AmountIsZero");
		});

		it("Should revert when settleIn is called with zero sender fee for local transfer", async function () {
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-4"]));
			const rate = 100;

			const totalAmount = this.baseAmount;

			await mockUSDT.connect(this.provider).approve(gateway.target, totalAmount);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
						totalAmount,
						this.sender.address,
						0n,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith("SenderFeeIsZero");
		});

		it("Should revert when settleIn is called with unsupported token", async function () {
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-5"]));
			const rate = 750;
			const unsupportedToken = this.hacker.address;
			const totalAmount = this.baseAmount + this.senderFee;

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
			).to.be.revertedWith("TokenNotSupported");
		});

		it("Should handle settleIn with FX transfer fee splitting correctly", async function () {
			const rate = 750;
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-6"]));
			const senderFee = ethers.parseEther("1000");
			const baseAmount = ethers.parseEther("10000");

			await gateway.connect(this.deployer).setTokenFeeSettings(
				mockUSDT.target,
				50000, 50000, 30000, 500
			);

			const totalAmount = baseAmount;
			const protocolFee = totalAmount * this.protocolFeePercent / MAX_BPS;
			const recipientAmount = totalAmount - protocolFee;

			const initialTreasuryBalance = await mockUSDT.balanceOf(this.treasuryAddress.address);
			const initialSenderBalance = await mockUSDT.balanceOf(this.sender.address);
			const initialRecipientBalance = await mockUSDT.balanceOf(this.recipient.address);

			await mockUSDT.connect(this.alice).mint(totalAmount + senderFee);
			await mockUSDT.connect(this.alice).transfer(this.provider.address, totalAmount + senderFee);
			await mockUSDT.connect(this.provider).approve(gateway.target, totalAmount + senderFee);

			const senderAmount = senderFee * (MAX_BPS - 30000n) / MAX_BPS;
			const aggregatorAmount = senderFee - senderAmount;

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
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
					senderAmount,
					aggregatorAmount
				);

			expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(initialSenderBalance + senderAmount);
			expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
				initialTreasuryBalance + protocolFee + aggregatorAmount
			);
			expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(initialRecipientBalance + recipientAmount);

			await gateway.connect(this.deployer).setTokenFeeSettings(
				mockUSDT.target,
				50000, 50000, 0, 500
			);
		});

		it("Should revert when settleIn is called on paused contract", async function () {
			const orderId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test-order-7"]));
			const rate = 750;
			const totalAmount = this.baseAmount + this.senderFee;

			await gateway.connect(this.deployer).pause();

			await mockUSDT.connect(this.provider).approve(gateway.target, totalAmount);

			await expect(
				gateway
					.connect(this.provider)
					.settleIn(
						orderId,
						mockUSDT.target,
						totalAmount,
						this.sender.address,
						this.senderFee,
						this.recipient.address,
						rate
					)
			).to.be.revertedWith("Pausable: paused");

			await gateway.connect(this.deployer).unpause();
		});
	});
});
