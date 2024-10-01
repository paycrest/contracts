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

describe("Gateway Provider withdraw", function () {
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

        const aggregator = ethers.utils.formatBytes32String("aggregator");

		await expect(
			gateway
				.connect(this.deployer)
				.updateProtocolAddress(aggregator, this.aggregator.address)
		).to.emit(gateway, Events.Gateway.ProtocolAddressUpdated);
    });

    it("Should withdraw successfully with valid signature", async function () {
        const amount = ethers.utils.parseEther("1000");
        const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "address",],
            [this.alice.address, this.bob.address, amount, this.mockUSDT.address]
        );
        const signature = await this.alice.signMessage(ethers.utils.arrayify(messageHash));

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

        await expect(
            this.gateway
                .connect(this.aggregator)
                .withdrawFrom(this.alice.address, this.bob.address, amount, this.mockUSDT.address, signature)
        )
            .to.emit(this.gateway, Events.Gateway.Withdrawn)
            .withArgs(this.alice.address, this.bob.address, amount, this.mockUSDT.address);

        await assertDepositBalance(
            this.gateway,
            this.mockUSDT.address,
            this.alice.address,
            this.depositAmount.sub(amount)
        );

    });

    it("Should fail with invalid signature", async function () {
        const amount = ethers.utils.parseEther("1000");
        const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "address"],
            [this.alice.address, this.bob.address, this.mockUSDT.address, amount]
        );
        const ethSignedMessageHash = ethers.utils.hashMessage(messageHash);
        const invalidSignature = await this.bob.signMessage(ethers.utils.arrayify(ethSignedMessageHash));

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
            
        await expect(
            this.gateway
                .connect(this.aggregator)
                .withdrawFrom( this.alice.address, this.bob.address, amount, this.mockUSDT.address, invalidSignature)
        ).to.be.revertedWith("InvalidSignature");
    });

    it("Should fail with insufficient balance", async function () {
        const amount = ethers.utils.parseEther("1000");
        const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "uint256", "address"],
            [this.alice.address, this.bob.address, amount, this.mockUSDT.address]
        );
        const signature = await this.alice.signMessage(ethers.utils.arrayify(messageHash));

        await expect(
            this.gateway
                .connect(this.aggregator)
                .withdrawFrom(this.alice.address, this.bob.address, amount, this.mockUSDT.address, signature)
        ).to.be.revertedWith("InsufficientBalance");
    });

    it("Should fail when called by non-aggregator", async function () {
        const amount = ethers.utils.parseEther("1000");
        const messageHash = ethers.utils.solidityKeccak256(
            ["address", "address", "address", "uint256"],
            [this.alice.address, this.bob.address, this.mockUSDT.address, amount]
        );
        const ethSignedMessageHash = ethers.utils.hashMessage(messageHash);
        const signature = await this.alice.signMessage(ethers.utils.arrayify(ethSignedMessageHash));

        await expect(
            this.gateway
                .connect(this.alice)
                .withdrawFrom(this.alice.address, this.bob.address, amount, this.mockUSDT.address, signature)
        ).to.be.revertedWith("OnlyAggregator");
    });
});