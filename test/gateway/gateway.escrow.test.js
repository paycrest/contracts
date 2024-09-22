const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { gatewayFixture } = require("../fixtures/gateway.js");
const {
	deployContract,
	ZERO_AMOUNT,
	Events,
	mockMintDeposit,
	assertBalance,
	assertDepositBalance,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Gateway Escrow", function () {
	beforeEach(async function () {
		[
			this.deployer,
			this.treasuryAddress,
			this.aggregator,
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
		await mockMintDeposit(gateway, this.Eve, mockUSDT, this.depositAmount);
		await mockMintDeposit(
			gateway,
			this.alice,
			this.mockDAI,
			this.depositAmount
		);
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
			ZERO_AMOUNT
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
	});

	it("Should escrow assets from provider to sender", async function () {
		const orderId = ethers.utils.formatBytes32String("order1");
		const amount = ethers.utils.parseEther("1000");

		// Create the message hash
		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		// Sign the message
		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		// Check initial balances
		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.alice.address,
			ZERO_AMOUNT
		);
		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.bob.address,
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

		// Perform the escrow
		await expect(
			this.gateway.connect(this.aggregator).escrow(
				orderId,
				signature,
				this.alice.address, // Provider
				this.bob.address, // Sender
				this.mockUSDT.address,
				amount
			)
		)
			.to.emit(this.gateway, Events.Gateway.Escrow)
			.withArgs(
				this.alice.address,
				this.bob.address,
				amount,
				this.mockUSDT.address,
				orderId
			);

		// Check final balances
		await assertDepositBalance(
			this.gateway,
			this.mockUSDT.address,
			this.alice.address,
			this.depositAmount.sub(amount)
		);

		await assertBalance(this.mockUSDT, this.mockUSDT, this.bob.address, amount);
	});

	it("Should fail if the order is already processed", async function () {
		const orderId = ethers.utils.formatBytes32String("order1");
		const amount = ethers.utils.parseEther("1000");

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

		// Create the message hash
		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		// Sign the message
		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		// Perform the escrow
		await this.gateway
			.connect(this.aggregator)
			.escrow(
				orderId,
				signature,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount
			);

		// Try to perform the escrow again
		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("Order already processed");
	});

	it("Should fail if the signature is invalid", async function () {
		const orderId = ethers.utils.formatBytes32String("order1");
		const amount = ethers.utils.parseEther("1000");

		// Create the message hash
		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		// Sign the message with a different account
		const signature = await this.hacker.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		// Try to perform the escrow
		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("Invalid signature");
	});

	it("Should fail if the provider has insufficient balance", async function () {
		const orderId = ethers.utils.formatBytes32String("order1");
		const amount = ethers.utils.parseEther("2000000"); // More than the deposit amount

		// Create the message hash
		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		// Sign the message
		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		// Try to perform the escrow
		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("Insufficient balance");
	});

	it("Should fail when provider address is zero", async function () {
		const orderId = ethers.utils.formatBytes32String("order2");
		const amount = ethers.utils.parseEther("1000");
		const zeroAddress = ethers.constants.AddressZero;

		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[orderId, zeroAddress, this.bob.address, this.mockUSDT.address, amount]
		);

		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					zeroAddress,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("Invalid provider address");
	});

	it("Should revert when sender address is zero", async function () {
		const orderId = ethers.utils.formatBytes32String("zeroSenderOrder");
		const amount = ethers.utils.parseEther("1");
		const zeroAddress = ethers.constants.AddressZero;

		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[orderId, this.alice.address, zeroAddress, this.mockUSDT.address, amount]
		);

		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					zeroAddress,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("Invalid sender address");
	});

	it("Should correctly calculate and transfer protocol fees", async function () {
		const orderId = ethers.utils.formatBytes32String("feeOrder");
		const amount = ethers.utils.parseEther("1000");
		const newProtocolFeePercent = 250; // 2.5%

		// Set a new protocol fee
		await this.gateway
			.connect(this.deployer)
			.updateProtocolFee(newProtocolFeePercent);

		// Create the message hash
		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		// Sign the message
		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		// Get initial balances
		const initialTreasuryBalance = await this.mockUSDT.balanceOf(
			this.treasuryAddress.address
		);
		const initialBobBalance = await this.mockUSDT.balanceOf(this.bob.address);

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

		const initialAliceBalance = await this.gateway.getBalance(
			this.mockUSDT.address,
			this.alice.address
		);

		// Perform the escrow
		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.emit(this.gateway, "Escrow");
		const feeDetails = await this.gateway.getFeeDetails();
		// Calculate expected fee
		const expectedFee = amount.mul(feeDetails[0]).div(feeDetails[1]);

		// Check final balances
		const finalTreasuryBalance = await this.mockUSDT.balanceOf(
			this.treasuryAddress.address
		);
		const finalAliceBalance = await this.gateway.getBalance(
			this.mockUSDT.address,
			this.alice.address
		);
		const finalBobBalance = await this.mockUSDT.balanceOf(this.bob.address);

		expect(finalTreasuryBalance).to.equal(
			initialTreasuryBalance.add(expectedFee)
		);
		expect(finalAliceBalance).to.equal(
			initialAliceBalance.sub(amount.add(expectedFee))
		);

		expect(finalBobBalance).to.equal(initialBobBalance.add(amount));

		// validate treasury balance
		expect(await this.mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
			initialTreasuryBalance.add(expectedFee)
		);
	});

	it("Should revert when a non-aggregator calls escrow", async function () {
		const orderId = ethers.utils.formatBytes32String("nonAggregatorOrder");
		const amount = ethers.utils.parseEther("1");

		await this.gateway
			.connect(this.alice)
			.deposit(this.mockUSDT.address, amount);

		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		await expect(
			this.gateway
				.connect(this.alice)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("OnlyAggregator");
	});

	it("Should revert when amount is zero", async function () {
		const orderId = ethers.utils.formatBytes32String("zeroAmountOrder");
		const amount = BigNumber.from(0);

		const messageHash = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "address", "uint256"],
			[
				orderId,
				this.alice.address,
				this.bob.address,
				this.mockUSDT.address,
				amount,
			]
		);

		const signature = await this.alice.signMessage(
			ethers.utils.arrayify(messageHash)
		);

		await expect(
			this.gateway
				.connect(this.aggregator)
				.escrow(
					orderId,
					signature,
					this.alice.address,
					this.bob.address,
					this.mockUSDT.address,
					amount
				)
		).to.be.revertedWith("AmountIsZero");
	});

});
