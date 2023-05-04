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
      this.keeper,
      this.aggregator,
      this.alice,
      this.hacker,
      ...this.accounts
    ] = await ethers.getSigners();

    this.mockUSDC = await deployContract("MockUSDC");
    this.mockUSDT = await deployContract("MockUSDC");
    this.mintAmount = ethers.utils.parseEther("1000000");
    await this.mockUSDC.connect(this.alice).mint(this.mintAmount);
    await this.mockUSDT.connect(this.alice).mint(this.mintAmount);
    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
    this.paycrest = await deployContract("Paycrest", [this.mockUSDC.address]);
    this.paycrestValidator = await deployContract("PaycrestValidator", [
      this.paycrest.address,
    ]);
  });

  it("Should be able to create order by Alice", async function () {
    const ret = await setSupportedInstitution( this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);
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

    [this.name, this.currency] =
      await this.paycrest.getSupportedInstitutionName(institutionCode);
    expect(this.name).to.eq(ret.firstBank.name);
    expect(this.currency).to.eq(ret.currency);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );

    // =================== Create Order ===================
    var bytes = CryptoJS.AES.decrypt(messageHash.substring(2), password);
    var decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

    console.log(decryptedData); // [{id: 1}, {id: 2}]

    const mockUSDC = await this.paycrest.isTokenSupported(
      this.mockUSDC.address
    );
    expect(mockUSDC).to.eq(true);
  });

  it("Should revert when creating order with non-supported token", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.mockUSDT
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);
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
          this.mockUSDT.address,
          this.mintAmount,
          this.alice.address,
          rate,
          institutionCode,
          messageHash.toString()
        )
    ).to.be.revertedWithCustomError(this.paycrest, Errors.Paycrest.TokenNotSupported);

    [
      this.seller,
      this.token,
      this.rate,
      this.isFulfilled,
      this.refundAddress,
      this.currentBPS,
      this.amount,
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );

  });

  it("Should revert when creating order with zero input amount", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);
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
          ZERO_AMOUNT,
          this.alice.address,
          rate,
          institutionCode,
          messageHash.toString()
        )
    ).to.be.revertedWithCustomError(
      this.paycrest,
      Errors.Paycrest.AmountIsZero
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

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
  });

  it("Should revert when creating order with zero address as refundable address", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);
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
          ZERO_ADDRESS,
          rate,
          institutionCode,
          messageHash.toString()
        )
    ).to.be.revertedWithCustomError(
      this.paycrest,
      Errors.Paycrest.ThrowZeroAddress
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

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
  });

  it("Should revert when creating order with invalid supported institutions", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);

    await this.mockUSDC
      .connect(this.alice)
      .approve(this.paycrest.address, this.mintAmount);
    const rate = 750;
    const invalidInstitutionCode = ethers.utils.formatBytes32String("0000");
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
          invalidInstitutionCode,
          messageHash.toString()
        )
    ).to.be.revertedWithCustomError(
      this.paycrest,
      Errors.Paycrest.InvalidInstitutionCode
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

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
  });

});
