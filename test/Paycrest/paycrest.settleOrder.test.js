const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const { paycrestFixture } = require("../fixtures/paycrest.js");

const {
  ZERO_AMOUNT,
  FEE_BPS,
  MAX_BPS,
  Events,
  setSupportedInstitutions,
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

    ({ paycrest, mockUSDT } = await paycrestFixture());

    this.mintAmount = ethers.utils.parseEther("1000100");
    this.orderAmount = ethers.utils.parseEther("1000000");
    this.protocolFee = ethers.utils.parseEther("5000");
    this.senderFee = ethers.utils.parseEther("100");

    this.liquidityProviderAmount = ethers.utils.parseEther("995000");
    this.protocolFeeAmount = ethers.utils.parseEther("5000");

    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      paycrest
        .connect(this.deployer)
        .updateProtocolFees(protocolFeePercent)
    )
      .to.emit(paycrest, Events.Paycrest.ProtocolFeesUpdated)
      .withArgs(protocolFeePercent);

    await mockUSDT.connect(this.alice).mint(this.mintAmount);

    expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    await mockUSDT
      .connect(this.alice)
      .transfer(this.sender.address, this.mintAmount);

    expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

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
      paycrest
      .connect(this.deployer)
      .updateProtocolAddress(treasury, this.treasuryAddress.address)
    ).to.emit(paycrest, Events.Paycrest.ProtocolAddressUpdated);

    const aggregator = ethers.utils.formatBytes32String("aggregator");

    await expect(
      paycrest
      .connect(this.deployer)
      .updateProtocolAddress(aggregator, this.aggregator.address)
    ).to.emit(paycrest, Events.Paycrest.ProtocolAddressUpdated);

    await expect(
      paycrest
      .connect(this.deployer)
      .updateProtocolFees(FEE_BPS)
    ).to.emit(paycrest, Events.Paycrest.ProtocolFeesUpdated)

    expect(
      await mockUSDT.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    const token = ethers.utils.formatBytes32String("token");

    await expect(
      paycrest
        .connect(this.deployer)
        .settingManagerBool(token, mockUSDT.address, BigNumber.from(1))
    )
      .to.emit(paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(token, mockUSDT.address, BigNumber.from(1));
  });

  it("Should be able to create order by the sender and settled by the liquidity aggregator", async function () {
    const ret = await setSupportedInstitutions(paycrest, this.deployer);

    await mockUSDT
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDT.allowance(this.sender.address, paycrest.address)
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
          mockUSDT.address,
          this.orderAmount,
          institutionCode,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderCreated)
      .withArgs(
        this.sender.address,
        mockUSDT.address,
        BigNumber.from(this.orderAmount).sub(this.protocolFee),
        this.protocolFee,
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
      this.protocolFee,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.sender.address);
    expect(this.token).to.eq(mockUSDT.address);
    expect(this.senderRecipient).to.eq(this.sender.address);
    expect(this.senderFee).to.eq(this.senderFee);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(BigNumber.from(this.orderAmount).sub(this.protocolFee));

    expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(
      await mockUSDT.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================

    expect(
      await paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          orderId,
          this.liquidityProvider.address,
          MAX_BPS,
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderSettled)
      .withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS);

    expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
      this.protocolFeeAmount
    );
    expect(await mockUSDT.balanceOf(paycrest.address)).to.eq(
      ZERO_AMOUNT
    );
  });

  it("Should revert when trying to settle an already fulfilled order", async function () {
    const ret = await setSupportedInstitutions(paycrest, this.deployer);

    await mockUSDT
      .connect(this.sender)
      .approve(paycrest.address, this.mintAmount);

    expect(
      await mockUSDT.allowance(this.sender.address, paycrest.address)
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
          mockUSDT.address,
          this.orderAmount,
          institutionCode,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderCreated)
      .withArgs(
        this.sender.address,
        mockUSDT.address,
        BigNumber.from(this.orderAmount).sub(this.protocolFee),
        this.protocolFee,
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
      this.protocolFee,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(this.sender.address);
    expect(this.token).to.eq(mockUSDT.address);
    expect(this.senderRecipient).to.eq(this.sender.address);
    expect(this.senderFee).to.eq(this.senderFee);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(this.alice.address);
    expect(this.currentBPS).to.eq(MAX_BPS);
    expect(this.amount).to.eq(BigNumber.from(this.orderAmount).sub(this.protocolFee));

    expect(await mockUSDT.balanceOf(this.alice.address)).to.eq(ZERO_AMOUNT);

    expect(
      await mockUSDT.allowance(this.alice.address, paycrest.address)
    ).to.equal(ZERO_AMOUNT);

    // =================== Create Order ===================
    expect(
      await paycrest
        .connect(this.aggregator)
        .settle(
          orderId,
          orderId,
          this.liquidityProvider.address,
          MAX_BPS,
        )
    )
      .to.emit(paycrest, Events.Paycrest.OrderSettled)
      .withArgs(orderId, orderId, this.liquidityProvider.address, MAX_BPS);

    expect(await mockUSDT.balanceOf(this.liquidityProvider.address)).to.eq(
      this.liquidityProviderAmount
    );
    expect(await mockUSDT.balanceOf(this.treasuryAddress.address)).to.eq(
      this.protocolFeeAmount
    );

    expect(await mockUSDT.balanceOf(paycrest.address)).to.eq(ZERO_AMOUNT);

  });
});
