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
			this.recipient,
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

	it("Should be able to process settlement order to the recipient while taking protocol fees", async function () {
		const ret = await getSupportedInstitutions();

        const mintAmountWithFee = this.mintAmount.add(this.protocolFee);

		await mockUSDT.connect(this.liquidityProvider).mint(mintAmountWithFee);

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

		const argOrderID = [this.recipient.address, 1];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

        await mockUSDT.connect(this.liquidityProvider).transfer(gateway.address, mintAmountWithFee);

		await expect(
			gateway
				.connect(this.aggregator)
				.settleIn(
                    orderId,
					mockUSDT.address,
					this.orderAmount,
					this.sender.address,
					this.senderFee,
                    this.liquidityProvider.address,
                    this.protocolFee,
					this.recipient.address,
					rate,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.SettleIn)
			.withArgs(
				orderId,
                this.orderAmount,
                this.recipient.address,
                mockUSDT.address,
                this.sender.address,
                this.liquidityProvider.address,
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
            
		expect(this.seller).to.eq(this.recipient.address);
		expect(this.token).to.eq(mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(this.senderFee);
		expect(this.isFulfilled).to.eq(true);
		expect(this.isRefunded).to.eq(false);
		expect(this.amount).to.eq(BigNumber.from(this.orderAmount));

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(ZERO_AMOUNT);

        expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(this.senderFee);

		expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(
			this.orderAmount
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});

	it("Should be able to process settlement order to the recipient while taking sender fees, and protocol fees", async function () {
		const ret = await getSupportedInstitutions();

        const mintAmountWithFee = this.mintAmount.add(this.protocolFee);

		await mockUSDT.connect(this.liquidityProvider).mint(mintAmountWithFee);

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

		const argOrderID = [this.recipient.address, 1];

		const encoded = ethers.utils.defaultAbiCoder.encode(
			["address", "uint256"],
			argOrderID
		);
		const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

        await mockUSDT.connect(this.liquidityProvider).transfer(gateway.address, mintAmountWithFee);

        const senderFee = ethers.utils.parseEther("1000");

		await expect(
			gateway
				.connect(this.aggregator)
				.settleIn(
                    orderId,
					mockUSDT.address,
					this.orderAmount,
					this.sender.address,
					senderFee,
                    this.liquidityProvider.address,
                    this.protocolFee,
					this.recipient.address,
					rate,
					messageHash.toString()
				)
		)
			.to.emit(gateway, Events.Gateway.SettleIn)
			.withArgs(
				orderId,
                this.orderAmount,
                this.recipient.address,
                mockUSDT.address,
                this.sender.address,
                this.liquidityProvider.address,
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
            
		expect(this.seller).to.eq(this.recipient.address);
		expect(this.token).to.eq(mockUSDT.address);
		expect(this.senderRecipient).to.eq(this.sender.address);
		expect(this.senderFee).to.eq(senderFee);
		expect(this.isFulfilled).to.eq(true);
		expect(this.isRefunded).to.eq(false);
		expect(this.amount).to.eq(this.orderAmount.sub(senderFee));

		expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(ZERO_AMOUNT);

        expect(await mockUSDT.balanceOf(this.sender.address)).to.eq(senderFee);

		expect(await mockUSDT.balanceOf(this.recipient.address)).to.eq(
			this.orderAmount.sub(senderFee)
		);
		expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			this.protocolFee
		);
		expect(await mockUSDT.balanceOf(gateway.address)).to.eq(ZERO_AMOUNT);
	});
});
