const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const {
  paycrestValidatorFixture,
} = require("../fixtures/paycrestValidator.js");


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
      this.sender,
      this.hacker,
      ...this.accounts
    ] = await ethers.getSigners();

    ({
      paycrestValidator,
      paycrest,
      mockUSDC
    } = await paycrestValidatorFixture());

    // this.mockUSDC = usdc;
    // this.mockUSDT = usdt;

    this.mintAmount = ethers.utils.parseEther("1000100");
    this.senderFee = ethers.utils.parseEther("100");
    this.stakeAmount = ethers.utils.parseEther("1000000");

    this.liquidityProviderAmount = ethers.utils.parseEther("950000");
    this.protocolFeeAmount = ethers.utils.parseEther("49750");
    this.rewards = ethers.utils.parseEther("250");
    this.primaryValidatorReward = ethers.utils.parseEther("250");
    this.secondaryValidatorReward = ethers.utils.parseEther("250");

    await mockUSDC.connect(this.alice).mint(this.mintAmount);
    await mockUSDC.connect(this.bob).mint(this.stakeAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    expect(await mockUSDC.balanceOf(this.bob.address)).to.eq(
      this.stakeAmount
    );
    await mockUSDC
      .connect(this.alice)
      .transfer(this.sender.address, this.mintAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(await mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(await mockUSDC.balanceOf(this.aggregator.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      ZERO_AMOUNT
    );
    // this.paycrest = paycrest;
    // console.log("before init");
    // this.paycrestValidator = paycrestValidator;

    expect(
      await paycrestValidator.getValidatorInfo(
        this.bob.address,
        mockUSDC.address
      )
    ).to.eq(ZERO_AMOUNT);

    const fee = ethers.utils.formatBytes32String("fee");
    const aggregator = ethers.utils.formatBytes32String("aggregator");
    const stake = ethers.utils.formatBytes32String("stake");

    await paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await paycrest
      .connect(this.deployer)
      .updateFeeRecipient(aggregator, this.aggregator.address);

    await paycrest
      .connect(this.deployer)
      .updateFeeRecipient(stake, paycrestValidator.address);

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    expect(
      await mockUSDC.allowance(
        this.bob.address,
        paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);

    const whitelist = ethers.utils.formatBytes32String("whitelist");

    await expect(
      paycrest
        .connect(this.deployer)
        .settingManagerBool(whitelist, this.sender.address, true)
    )
      .to.emit(paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(whitelist, this.sender.address, true);
  });

  it("Should be able to create order by the sender and settled by liquidity aggregator", async function () {
    const ret = await setSupportedInstitution(paycrest, this.deployer);

    await mockUSDC
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDC.allowance(this.sender.address, paycrest.address)
    ).to.equal(this.mintAmount);

    await mockUSDC
      .connect(this.bob)
      .approve(paycrestValidator.address, this.stakeAmount);

    expect(
      await mockUSDC.allowance(
        this.bob.address,
        paycrestValidator.address
      )
    ).to.equal(this.stakeAmount);

    const rate = 750;
    const institutionCode = ret.firstBank.code;
    const data = [
      { bank_account: "09090990901" },
      { bank_name: "opay" },
      { accoun_name: "opay opay" },
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
      paycrest
        .connect(this.sender)
        .createOrder(
          mockUSDC.address,
          this.mintAmount,
          institutionCode,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.Deposit)
      .withArgs(
        mockUSDC.address,
        this.mintAmount,
        orderId,
        rate,
        institutionCode,
        messageHash.toString()
      );

    [
      this.seller,
      this.token,
      this.senderRecipient,
      this.senderFee,
      this.rate,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.sender.address);
    expect(this.token).to.eq(mockUSDC.address);
    expect(this.senderRecipient).to.eq(this.sender.address);
    expect(this.senderFee).to.eq(this.senderFee);
    expect(this.rate).to.eq(rate);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(this.mintAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    await paycrestValidator
      .connect(this.bob)
      .stake(mockUSDC.address, this.stakeAmount);
    expect(
      await mockUSDC.allowance(
        this.bob.address,
        paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);

    expect(
      await paycrest
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

    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await mockUSDC.balanceOf(paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await mockUSDC.balanceOf(paycrestValidator.address)).to.eq(
      this.rewards.add(this.stakeAmount)
    );

    expect(
      await paycrestValidator.getValidatorInfo(
        this.bob.address,
        mockUSDC.address
      )
    ).to.eq(this.secondaryValidatorReward.add(this.stakeAmount));

    expect(
      await paycrestValidator.getValidatorInfo(
        this.primaryValidator.address,
        mockUSDC.address
      )
    ).to.eq(0);
  });

  it("Should revert when trying to settle an already fulfilled order", async function () {
    const ret = await setSupportedInstitution(paycrest, this.deployer);

    await mockUSDC
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDC.allowance(this.sender.address, paycrest.address)
    ).to.equal(this.mintAmount);

    await mockUSDC
      .connect(this.bob)
      .approve(paycrestValidator.address, this.stakeAmount);

    expect(
      await mockUSDC.allowance(
        this.bob.address,
        paycrestValidator.address
      )
    ).to.equal(this.stakeAmount);

    const rate = 750;
    const institutionCode = ret.firstBank.code;
    const data = [
      { bank_account: "09090990901" },
      { bank_name: "opay" },
      { accoun_name: "opay opay" },
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
      paycrest
        .connect(this.sender)
        .createOrder(
          mockUSDC.address,
          this.mintAmount,
          institutionCode,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.Deposit)
      .withArgs(
        mockUSDC.address,
        this.mintAmount,
        orderId,
        rate,
        institutionCode,
        messageHash.toString()
      );

    [
      this.seller,
      this.token,
      this.senderRecipient,
      this.senderFee,
      this.rate,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.sender.address);
    expect(this.token).to.eq(mockUSDC.address);
    expect(this.senderRecipient).to.eq(this.sender.address);
    expect(this.senderFee).to.eq(this.senderFee);
    expect(this.rate).to.eq(rate);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(this.mintAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    await paycrestValidator
      .connect(this.bob)
      .stake(mockUSDC.address, this.stakeAmount);
    expect(
      await mockUSDC.allowance(
        this.bob.address,
        paycrestValidator.address
      )
    ).to.equal(ZERO_AMOUNT);

    expect(
      await paycrest
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

    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDC.balanceOf(this.feeRecipient.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await mockUSDC.balanceOf(paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await mockUSDC.balanceOf(paycrestValidator.address)).to.eq(
      this.rewards.add(this.stakeAmount)
    );

    expect(
      await paycrestValidator.getValidatorInfo(
        this.bob.address,
        mockUSDC.address
      )
    ).to.eq(this.secondaryValidatorReward.add(this.stakeAmount));

    expect(
      await paycrestValidator.getValidatorInfo(
        this.primaryValidator.address,
        mockUSDC.address
      )
    ).to.eq(0);
  });
});
