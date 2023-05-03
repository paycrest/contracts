const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const {
  deployContract,
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  FEE_BPS,
  MAX_BPS,
  Errors,
  Events,
  setSupportedInstitution,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Paycrest create order", function () {
  beforeEach(async function () {
    [
      this.deployer,
      this.feeRecipient,
      this.primaryValidator,
      this.aggregator,
      this.alice,
      this.bob,
      this.liquidityProvider,
      this.hacker,
      ...this.accounts
    ] = await ethers.getSigners();

    this.mockUSDC = await deployContract("MockUSDC");
    this.mockUSDT = await deployContract("MockUSDC");
    this.mintAmount = ethers.utils.parseEther("1000000");
    this.stakeAmount = ethers.utils.parseEther("1000000");

    this.liquidityProviderAmount = ethers.utils.parseEther("950000");
    this.protocolFeeAmount = ethers.utils.parseEther("49500");
    this.rewards = ethers.utils.parseEther("500");
    this.primaryValidatorReward = ethers.utils.parseEther("250");
    this.secondaryValidatorReward = ethers.utils.parseEther("250");

    await this.mockUSDC.connect(this.alice).mint(this.mintAmount);
    await this.mockUSDC.connect(this.bob).mint(this.stakeAmount);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    expect(await this.mockUSDC.balanceOf(this.bob.address)).to.eq(
      this.stakeAmount
    );
    expect(await this.mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await this.mockUSDC.balanceOf(this.aggregator.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await this.mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      ZERO_AMOUNT
    );
    this.paycrest = await deployContract("Paycrest", [this.mockUSDC.address]);
    this.paycrestValidator = await deployContract("PaycrestValidator", [
      this.paycrest.address,
    ]);

    expect(
      await this.paycrestValidator.getValidatorInfo(
        this.bob.address,
        this.mockUSDC.address
      )
    ).to.eq(ZERO_AMOUNT);

    const fee = ethers.utils.formatBytes32String("fee");
    const aggregator = ethers.utils.formatBytes32String("aggregator");
    const stake = ethers.utils.formatBytes32String("stake");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(aggregator, this.aggregator.address);

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(stake, this.paycrestValidator.address);

    expect(
      await this.mockUSDC.allowance(this.alice.address, this.paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    expect(
      await this.mockUSDC.allowance(
        this.bob.address,
        this.paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);
  });

  it("Should be able to create order by Alice and settled by liquidity aggregator", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);

    expect(
      await this.mockUSDC.allowance(this.alice.address, this.paycrest.address)
    ).to.equal(this.mintAmount);

    await this.mockUSDC
      .connect(this.bob)
      .approve(this.paycrestValidator.address, this.stakeAmount);

    expect(
      await this.mockUSDC.allowance(
        this.bob.address,
        this.paycrestValidator.address
      )
    ).to.equal(this.mintAmount);

    const rate = 750;
    const institutionCode = ret.firstBank.code;
    const data = [
      { bank_account: 09090990901 },
      { bank_name: "opay" },
      { accoun_name: "opay opay" },
    ];
    const password = "123";

    const cipher = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      password
    ).toString();

    const messageHash = "0x" + cipher;

    const argOrderID = [this.alice.address, 1];

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      argOrderID
    );
    const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

    await expect(
      this.paycrest
        .connect(this.alice)
        .createOrder(
          this.mockUSDC.address,
          this.mintAmount,
          this.alice.address,
          rate,
          institutionCode,
          messageHash.toString()
        )
    )
      .to.emit(this.paycrest, Events.Paycrest.Deposit)
      .withArgs(
        orderId,
        this.mintAmount,
        rate,
        institutionCode,
        messageHash.toString()
      );

    [
      this.seller,
      this.token,
      this.rate,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.alice.address);
    expect(this.token).to.eq(this.mockUSDC.address);
    expect(this.rate).to.eq(rate);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(this.mintAmount);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(
      await this.mockUSDC.allowance(this.alice.address, this.paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    await this.paycrestValidator
      .connect(this.bob)
      .stake(this.mockUSDC.address, this.stakeAmount);
    expect(
      await this.mockUSDC.allowance(
        this.bob.address,
        this.paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);

    expect(
      await this.paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          this.primaryValidator.address,
          [this.bob.address],
          this.liquidityProvider.address,
          MAX_BPS
        )
    )
      .to.emit(this.paycrest, Events.Paycrest.Settled)
      .withArgs(orderId, this.liquidityProvider.address, MAX_BPS);

    expect(await this.mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await this.mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await this.mockUSDC.balanceOf(this.paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await this.mockUSDC.balanceOf(this.paycrestValidator.address)).to.eq(
      this.rewards.add(this.stakeAmount)
    );

    expect(
      await this.paycrestValidator.getValidatorInfo(
        this.bob.address,
        this.mockUSDC.address
      )
    ).to.eq(this.secondaryValidatorReward.add(this.stakeAmount));

    expect(
      await this.paycrestValidator.getValidatorInfo(
        this.primaryValidator.address,
        this.mockUSDC.address
      )
    ).to.eq(this.primaryValidatorReward);

  });

  it("Should revert when trying to settle an already fulfilled order", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);

    expect(
      await this.mockUSDC.allowance(this.alice.address, this.paycrest.address)
    ).to.equal(this.mintAmount);

    await this.mockUSDC
      .connect(this.bob)
      .approve(this.paycrestValidator.address, this.stakeAmount);

    expect(
      await this.mockUSDC.allowance(
        this.bob.address,
        this.paycrestValidator.address
      )
    ).to.equal(this.mintAmount);

    const rate = 750;
    const institutionCode = ret.firstBank.code;
    const data = [
      { bank_account: 09090990901 },
      { bank_name: "opay" },
      { accoun_name: "opay opay" },
    ];
    const password = "123";

    const cipher = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      password
    ).toString();

    const messageHash = "0x" + cipher;

    const argOrderID = [this.alice.address, 1];

    const encoded = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      argOrderID
    );
    const orderId = ethers.utils.solidityKeccak256(["bytes"], [encoded]);

    await expect(
      this.paycrest
        .connect(this.alice)
        .createOrder(
          this.mockUSDC.address,
          this.mintAmount,
          this.alice.address,
          rate,
          institutionCode,
          messageHash.toString()
        )
    )
      .to.emit(this.paycrest, Events.Paycrest.Deposit)
      .withArgs(
        orderId,
        this.mintAmount,
        rate,
        institutionCode,
        messageHash.toString()
      );

    [
      this.seller,
      this.token,
      this.rate,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.alice.address);
    expect(this.token).to.eq(this.mockUSDC.address);
    expect(this.rate).to.eq(rate);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(this.mintAmount);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(
      await this.mockUSDC.allowance(this.alice.address, this.paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    await this.paycrestValidator
      .connect(this.bob)
      .stake(this.mockUSDC.address, this.stakeAmount);
    expect(
      await this.mockUSDC.allowance(
        this.bob.address,
        this.paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);

    expect(
      await this.paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          this.primaryValidator.address,
          [this.bob.address],
          this.liquidityProvider.address,
          MAX_BPS
        )
    )
      .to.emit(this.paycrest, Events.Paycrest.Settled)
      .withArgs(orderId, this.liquidityProvider.address, MAX_BPS);

    expect(await this.mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await this.mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await this.mockUSDC.balanceOf(this.paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await this.mockUSDC.balanceOf(this.paycrestValidator.address)).to.eq(
      this.rewards.add(this.stakeAmount)
    );

    expect(
      await this.paycrestValidator.getValidatorInfo(
        this.bob.address,
        this.mockUSDC.address
      )
    ).to.eq(this.secondaryValidatorReward.add(this.stakeAmount));

    expect(
      await this.paycrestValidator.getValidatorInfo(
        this.primaryValidator.address,
        this.mockUSDC.address
      )
    ).to.eq(this.primaryValidatorReward);

    // expect(
    //   await this.paycrest
    //     .connect(this.aggregator)
    //     .settle(
    //       orderId,
    //       this.primaryValidator.address,
    //       [this.bob.address],
    //       this.liquidityProvider.address,
    //       MAX_BPS
    //     )
    // ).to.be.revertedWithCustomError(
    //   this.paycrest,
    //   Errors.Paycrest.OrderFulfilled
    // );
      
  });

});
