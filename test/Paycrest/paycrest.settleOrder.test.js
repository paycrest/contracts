const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const { paycrestFixture } = require("../fixtures/paycrest.js");
const label = ethers.utils.formatBytes32String("label");


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

describe("Paycrest settle order", function () {
  beforeEach(async function () {
    [
      this.deployer,
      this.treasuryAddress,
      this.primaryValidator,
      this.aggregator,
      this.alice,
      this.bob,
      this.liquidityProvider,
      this.sender,
      this.hacker,
      ...this.accounts
    ] = await ethers.getSigners();

    ({ paycrest, mockUSDC } = await paycrestFixture());

    this.mintAmount = ethers.utils.parseEther("1000100");
    this.senderFee = ethers.utils.parseEther("100");

    this.liquidityProviderAmount = ethers.utils.parseEther("900000");
    this.protocolFeeAmount = ethers.utils.parseEther("100000");

    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      paycrest
        .connect(this.deployer)
        .updateProtocolFees(protocolFeePercent)
    )
      .to.emit(paycrest, Events.Paycrest.ProtocolFeesUpdated)
      .withArgs(protocolFeePercent);

    await mockUSDC.connect(this.alice).mint(this.mintAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    await mockUSDC
      .connect(this.alice)
      .transfer(this.sender.address, this.mintAmount);

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(await mockUSDC.balanceOf(this.treasuryAddress.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(await mockUSDC.balanceOf(this.aggregator.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      ZERO_AMOUNT
    );

    const treasury = ethers.utils.formatBytes32String("treasury");

    await expect(
      paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(treasury, this.treasuryAddress.address)
    ).to.emit(paycrest, Events.Paycrest.ProtocolAddressesUpdated);

    const aggregator = ethers.utils.formatBytes32String("aggregator");

    await expect(
      paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(aggregator, this.aggregator.address)
    ).to.emit(paycrest, Events.Paycrest.ProtocolAddressesUpdated);

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    const token = ethers.utils.formatBytes32String("token");

    await expect(
      paycrest
        .connect(this.deployer)
        .settingManagerBool(token, mockUSDC.address, true)
    )
      .to.emit(paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(token, mockUSDC.address, true);
  });

  it("Should be able to create order by the sender and settled by the liquidity aggregator", async function () {
    const ret = await setSupportedInstitution(paycrest, this.deployer);

    await mockUSDC
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDC.allowance(this.sender.address, paycrest.address)
    ).to.equal(this.mintAmount);

    const rate = 750;
    const institutionCode = ret.accessBank.code;
    const data = [
      { bank_account: "09090990901" },
      { bank_name: "ACCESS BANK" },
      { account_name: "Jeff Dean" },
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
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderCreated)
      .withArgs(
        mockUSDC.address,
        this.mintAmount,
        orderId,
        rate,
        institutionCode,
        label,
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

    expect(
      await paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          orderId,
          label,
          this.liquidityProvider.address,
          MAX_BPS,
          false
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderSettled)
      .withArgs(orderId, orderId, label, this.liquidityProvider.address, MAX_BPS);

    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDC.balanceOf(this.treasuryAddress.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await mockUSDC.balanceOf(paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
  });

  it("Should be able to create order by the sender and settled by liquidity aggregator when isPartner is true", async function () {
    const ret = await setSupportedInstitution(paycrest, this.deployer);

    await mockUSDC
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDC.allowance(this.sender.address, paycrest.address)
    ).to.equal(this.mintAmount);

    const rate = 750;
    const institutionCode = ret.accessBank.code;
    const data = [
      { bank_account: "09090990901" },
      { bank_name: "ACCESS BANK" },
      { account_name: "Jeff Dean" },
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
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderCreated)
      .withArgs(
        mockUSDC.address,
        this.mintAmount,
        orderId,
        rate,
        institutionCode,
        label,
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

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================

    expect(
      await paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          orderId,
          label,
          this.liquidityProvider.address,
          MAX_BPS,
          true
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderSettled)
      .withArgs(
        orderId,
        orderId,
        label,
        this.liquidityProvider.address,
        MAX_BPS
      );

    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount.add(this.protocolFeeAmount)
    );
    expect(await mockUSDC.balanceOf(this.treasuryAddress.address)).to.eq(0);
    expect(await mockUSDC.balanceOf(paycrest.address)).to.eq(ZERO_AMOUNT);

  });

  it("Should revert when trying to settle an already fulfilled order", async function () {
    const ret = await setSupportedInstitution(paycrest, this.deployer);

    await mockUSDC
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDC.allowance(this.sender.address, paycrest.address)
    ).to.equal(this.mintAmount);

    const rate = 750;
    const institutionCode = ret.accessBank.code;
    const data = [
      { bank_account: "09090990901" },
      { bank_name: "ACCESS BANK" },
      { account_name: "Jeff Dean" },
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
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderCreated)
      .withArgs(
        mockUSDC.address,
        this.mintAmount,
        orderId,
        rate,
        institutionCode,
        label,
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

    expect(await mockUSDC.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

    expect(
      await mockUSDC.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    expect(
      await paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          orderId,
          label,
          this.liquidityProvider.address,
          MAX_BPS,
          false
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderSettled)
      .withArgs(orderId, orderId, label, this.liquidityProvider.address, MAX_BPS);

    expect(await mockUSDC.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDC.balanceOf(this.treasuryAddress.address)).to.eq(
      this.protocolFeeAmount
    );

    expect(await mockUSDC.balanceOf(paycrest.address)).to.eq(ZERO_AMOUNT);

  });
});
