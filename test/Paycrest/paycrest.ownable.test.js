const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { paycrestFixture } = require("../fixtures/paycrest.js");
require("dotenv").config();

const { Errors, Events } = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Ownable settings", function () {
  let paycrest;
  let mockUSDC;
  let admin;
  let feeRecipient;
  let aggregator;
  let keeper;
  let alice;
  let hacker;
  let sender;
  let Mark;

  async function setupAndResetFork() {
    ({ paycrest, mockUSDC } = await paycrestFixture());

    [admin, keeper, alice, hacker, sender, Mark, feeRecipient, aggregator] =
      await ethers.getSigners();
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const _mockUSDC = await paycrest.isTokenSupported(mockUSDC.address);
    expect(_mockUSDC).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const Alice = await paycrest.isTokenSupported(alice.address);
    expect(Alice).to.eq(false);
  });

  it("should be able to whitelist sender and emit events", async function () {
    await setupAndResetFork();
    const whitelist = ethers.utils.formatBytes32String("whitelist");

    await expect(
      paycrest
        .connect(admin)
        .settingManagerBool(whitelist, sender.address, true)
    )
      .to.emit(paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(whitelist, sender.address, true);

    expect(await paycrest.getWhitelistedStatus(sender.address)).to.eq(true);
  });

  it("should be able to set supported arrays of Institution", async function () {
    await setupAndResetFork();
    const currency = ethers.utils.formatBytes32String("NGN");

    const firstBank = {
      code: ethers.utils.formatBytes32String("191"),
      name: ethers.utils.formatBytes32String("First Bank"),
    };

    const opay = {
      code: ethers.utils.formatBytes32String("192"),
      name: ethers.utils.formatBytes32String("Opay"),
    };
    const palmpay = {
      code: ethers.utils.formatBytes32String("193"),
      name: ethers.utils.formatBytes32String("Palmpay Bank"),
    };
    const accessBank = {
      code: ethers.utils.formatBytes32String("194"),
      name: ethers.utils.formatBytes32String("Access Bank"),
    };
    const gtb = {
      code: ethers.utils.formatBytes32String("195"),
      name: ethers.utils.formatBytes32String("GTB"),
    };
    const stanbic = {
      code: ethers.utils.formatBytes32String("196"),
      name: ethers.utils.formatBytes32String("Stanbic IBTC Bank"),
    };

    // await expect(
    paycrest
      .connect(admin)
      .setSupportedInstitutions(currency, [
        firstBank,
        opay,
        palmpay,
        accessBank,
        gtb,
        stanbic,
      ]);
    const currencies = await paycrest.getSupportedInstitutions(currency);
    // expect(currencies.length).to.eq(6);
    // console.log("all currencies", currencies);

    [this.firstBankName, this.currency] =
      await paycrest.getSupportedInstitutionName(firstBank.code);
    // expect(this.firstBankName).to.eq(firstBank.name);
    // expect(this.currency).to.eq(currency);
    [this.opayName, this.currency] = await paycrest.getSupportedInstitutionName(
      opay.code
    );
    // expect(this.opayName).to.eq(opay.name);
    // expect(this.currency).to.eq(currency);
    // [this.palmpayName, this.currency] =
    //   await paycrest.getSupportedInstitutionName(palmpay.code);
    // expect(this.palmpayName).to.eq(palmpay.name);
    // expect(this.currency).to.eq(currency);
    // [this.accessBankName, this.currency] =
    //   await paycrest.getSupportedInstitutionName(accessBank.code);
    // expect(this.accessBankName).to.eq(accessBank.name);
    // expect(this.currency).to.eq(currency);
    // [this.gtbName, this.currency] = await paycrest.getSupportedInstitutionName(
    //   gtb.code
    // );
    // expect(this.gtbName).to.eq(gtb.name);
    // expect(this.currency).to.eq(currency);
    // [this.stanbicName, this.currency] =
    //   await paycrest.getSupportedInstitutionName(stanbic.code);
    // expect(this.stanbicName).to.eq(stanbic.name);
    // expect(this.currency).to.eq(currency);
  });

  it("should revert when non-owner want to set Institution", async function () {
    await setupAndResetFork();
    const currency = ethers.utils.formatBytes32String("NGN");
    const zeroIndexBytes = ethers.utils.formatBytes32String("");

    const firstBank = {
      code: ethers.utils.formatBytes32String("191"),
      name: ethers.utils.formatBytes32String("First Bank"),
    };

    const opay = {
      code: ethers.utils.formatBytes32String("192"),
      name: ethers.utils.formatBytes32String("Opay"),
    };
    const palmpay = {
      code: ethers.utils.formatBytes32String("193"),
      name: ethers.utils.formatBytes32String("Palmpay Bank"),
    };
    const accessBank = {
      code: ethers.utils.formatBytes32String("194"),
      name: ethers.utils.formatBytes32String("Access Bank"),
    };
    const gtb = {
      code: ethers.utils.formatBytes32String("195"),
      name: ethers.utils.formatBytes32String("GTB"),
    };
    const stanbic = {
      code: ethers.utils.formatBytes32String("196"),
      name: ethers.utils.formatBytes32String("Stanbic IBTC Bank"),
    };

    await expect(
      paycrest
        .connect(hacker)
        .setSupportedInstitutions(currency, [
          firstBank,
          opay,
          palmpay,
          accessBank,
          gtb,
          stanbic,
        ])
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);

    [this.firstBankName, this.currency] =
      await paycrest.getSupportedInstitutionName(firstBank.code);
    expect(this.firstBankName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.opayName, this.currency] = await paycrest.getSupportedInstitutionName(
      opay.code
    );
    expect(this.opayName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.palmpayName, this.currency] =
      await paycrest.getSupportedInstitutionName(palmpay.code);
    expect(this.palmpayName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.accessBankName, this.currency] =
      await paycrest.getSupportedInstitutionName(accessBank.code);
    expect(this.accessBankName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.gtbName, this.currency] = await paycrest.getSupportedInstitutionName(
      gtb.code
    );
    expect(this.gtbName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.stanbicName, this.currency] =
      await paycrest.getSupportedInstitutionName(stanbic.code);
    expect(this.stanbicName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
  });

  it("should be able to set protocol fees and emit events", async function () {
    await setupAndResetFork();
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      paycrest
        .connect(admin)
        .updateProtocolFees(protocolFeePercent)
    )
      .to.emit(paycrest, Events.Paycrest.PaycrestFees)
      .withArgs(protocolFeePercent);

    [this.protocolFeePecent, this.MAXBPS] =
      await paycrest.getFeeDetails();
    expect(this.protocolFeePecent).to.eq(protocolFeePercent);
  });

  it("should not be able to set protocol fees by non-owner", async function () {
    await setupAndResetFork();
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      paycrest
        .connect(hacker)
        .updateProtocolFees(protocolFeePercent)
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update fee recipients, stake contract and aggregator", async function () {
    await setupAndResetFork();
    const fee = ethers.utils.formatBytes32String("fee");
    const _aggregator = ethers.utils.formatBytes32String("aggregator");

    await paycrest
      .connect(admin)
      .updateProtocolAddresses(fee, feeRecipient.address);

    await paycrest
      .connect(admin)
      .updateProtocolAddresses(_aggregator, aggregator.address);

    expect(await paycrest.getAggregatorAddress()).to.eq(aggregator.address);

  });
});
