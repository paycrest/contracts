const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

const { paycrestFixture } = require("../fixtures/paycrest.js");

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
const label = ethers.utils.formatBytes32String("label");

describe("Paycrest create order", function () {
  beforeEach(async function () {
    [
      this.deployer,
      this.treasuryAddress,
      this.keeper,
      this.aggregator,
      this.alice,
      this.sender,
      this.hacker,
      ...this.accounts
    ] = await ethers.getSigners();

    ({ paycrest, mockUSDC } = await paycrestFixture());

    this.mockUSDT = await deployContract("MockUSDC");
    this.mockUSDC = mockUSDC;
    this.paycrest = paycrest;

    this.mintAmount = ethers.utils.parseEther("1000100");
    this.senderFee = ethers.utils.parseEther("100");
    await this.mockUSDC.connect(this.alice).mint(this.mintAmount);
    await this.mockUSDT.connect(this.alice).mint(this.mintAmount);
    await this.mockUSDC
      .connect(this.alice)
      .transfer(this.sender.address, this.mintAmount);

    expect(await this.mockUSDC.balanceOf(this.alice.address)).to.eq(
      ZERO_AMOUNT
    );
    expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );

    const whitelist = ethers.utils.formatBytes32String("whitelist");

    await expect(
      this.paycrest
        .connect(this.deployer)
        .settingManagerBool(whitelist, this.sender.address, true)
    )
      .to.emit(this.paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(whitelist, this.sender.address, true);

    console.log("this.paycrest.address", this.paycrest.address);
  });

  it("Should be able to create order by Sender for Alice", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(fee, this.treasuryAddress.address);

    await this.mockUSDC
      .connect(this.sender)
      .approve(this.paycrest.address, this.mintAmount);
    const rate = 750;
    const institutionCode = ret.firstBank.code;

    const data = [
      { bank_account: "09090990901" },
      { bank_name: "opay" },
      { account_name: "opay opay" },
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
      this.paycrest
        .connect(this.sender)
        .createOrder(
          this.mockUSDC.address,
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
      .to.emit(this.paycrest, Events.Paycrest.Deposit)
      .withArgs(
        this.mockUSDC.address,
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
    ] = await this.paycrest.getOrderInfo(orderId);
    // expect sender balance to increase by sender fee
    expect(await this.mockUSDC.balanceOf(this.sender.address)).to.eq(
      ZERO_AMOUNT
    );

    expect(this.seller).to.eq(this.sender.address);
    expect(this.token).to.eq(this.mockUSDC.address);
    expect(this.senderRecipient).to.eq(this.sender.address);
    expect(this.senderFee).to.eq(this.senderFee);
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
      .updateProtocolAddresses(fee, this.treasuryAddress.address);

    await this.mockUSDT
      .connect(this.sender)
      .approve(this.paycrest.address, this.mintAmount);
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
      this.paycrest
        .connect(this.sender)
        .createOrder(
          this.mockUSDT.address,
          this.mintAmount,
          institutionCode,
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    ).to.be.revertedWith(Errors.Paycrest.TokenNotSupported);

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
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
  });

  it("Should revert when creating order with zero input amount", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(fee, this.treasuryAddress.address);

    await this.mockUSDC
      .connect(this.sender)
      .approve(this.paycrest.address, this.mintAmount);
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
      this.paycrest
        .connect(this.sender)
        .createOrder(
          this.mockUSDC.address,
          ZERO_AMOUNT,
          institutionCode,
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    ).to.be.revertedWith(Errors.Paycrest.AmountIsZero);

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
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDT.balanceOf(this.alice.address)).to.eq(
      this.mintAmount
    );
  });

  it("Should revert when creating order with zero address as refundable address", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(fee, this.treasuryAddress.address);

    await this.mockUSDC
      .connect(this.sender)
      .approve(this.paycrest.address, this.mintAmount);
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
      this.paycrest
        .connect(this.sender)
        .createOrder(
          this.mockUSDC.address,
          this.mintAmount,
          institutionCode,
          label,
          rate,
          this.sender.address,
          this.senderFee,
          ZERO_ADDRESS,
          messageHash.toString()
        )
    ).to.be.revertedWith(Errors.Paycrest.ThrowZeroAddress);

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
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.sender.address)).to.eq(
      this.mintAmount
    );
  });

  it("Should revert when creating order with invalid supported institutions", async function () {
    const ret = await setSupportedInstitution(this.paycrest, this.deployer);
    const fee = ethers.utils.formatBytes32String("fee");

    await this.paycrest
      .connect(this.deployer)
      .updateProtocolAddresses(fee, this.treasuryAddress.address);

    await this.mockUSDC
      .connect(this.sender)
      .approve(this.paycrest.address, this.mintAmount);
    const rate = 750;
    const invalidInstitutionCode = ethers.utils.formatBytes32String("0000");
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
      this.paycrest
        .connect(this.sender)
        .createOrder(
          this.mockUSDC.address,
          this.mintAmount,
          invalidInstitutionCode,
          label,
          rate,
          this.sender.address,
          this.senderFee,
          this.alice.address,
          messageHash.toString()
        )
    ).to.be.revertedWith(Errors.Paycrest.InvalidInstitutionCode);

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
    ] = await this.paycrest.getOrderInfo(orderId);

    expect(this.seller).to.eq(ZERO_ADDRESS);
    expect(this.token).to.eq(ZERO_ADDRESS);
    expect(this.rate).to.eq(ZERO_AMOUNT);
    expect(this.isFulfilled).to.eq(false);
    expect(this.refundAddress).to.eq(ZERO_ADDRESS);
    expect(this.currentBPS).to.eq(ZERO_AMOUNT);
    expect(this.amount).to.eq(ZERO_AMOUNT);

    expect(await this.mockUSDC.balanceOf(this.sender.address)).to.eq(
      this.mintAmount
    );
  });
});
