const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { paycrestFixture } = require("../fixtures/paycrest.js");
require("dotenv").config();

const { Errors, Events } = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Ownable settings", function () {
  let paycrest;
  let mockUSDT;
  let admin;
  let treasuryAddress;
  let aggregator;
  let keeper;
  let alice;
  let hacker;
  let sender;
  let Mark;

  async function setupAndResetFork() {
    ({ paycrest, mockUSDT } = await paycrestFixture());

    [admin, keeper, alice, hacker, sender, Mark, treasuryAddress, aggregator] =
      await ethers.getSigners();

    const token = ethers.utils.formatBytes32String("token");

    await expect(
      paycrest
        .connect(admin)
        .settingManagerBool(token, mockUSDT.address, true)
    )
      .to.emit(paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(token, mockUSDT.address, true);
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const _mockUSDT = await paycrest.isTokenSupported(mockUSDT.address);
    expect(_mockUSDT).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const Alice = await paycrest.isTokenSupported(alice.address);
    expect(Alice).to.eq(false);
  });

  it("should set array of supported institutions", async function () {
    await setupAndResetFork();
    const currency = ethers.utils.formatBytes32String("NGN");

    const accessBank = {
      code: ethers.utils.formatBytes32String("ABNGNGLA"),
      name: ethers.utils.formatBytes32String("ACCESS BANK"),
    };
    const diamondBank = {
      code: ethers.utils.formatBytes32String("DBLNNGLA"),
      name: ethers.utils.formatBytes32String("DIAMOND BANK"),
    }

    paycrest
      .connect(admin)
      .setSupportedInstitutions(currency, [
        accessBank,
        diamondBank,
      ]);
    const institutions = await paycrest.connect(admin).getSupportedInstitutions(currency);
    expect(institutions.length).to.eq(2);
      
    [this.accessBankName, this.currency] =
      await paycrest.getSupportedInstitutionByCode(accessBank.code);
    expect(this.accessBankName).to.eq(accessBank.name);
    expect(this.currency).to.eq(currency);

    [this.diamondBankName, this.currency] =
      await paycrest.getSupportedInstitutionByCode(diamondBank.code);
    expect(this.diamondBankName).to.eq(diamondBank.name);
    expect(this.currency).to.eq(currency);
  });

  it("should revert when non-owner sets supported institutions", async function () {
    await setupAndResetFork();
    const currency = ethers.utils.formatBytes32String("NGN");
    const zeroIndexBytes = ethers.utils.formatBytes32String("");

    const accessBank = {
      code: ethers.utils.formatBytes32String("ABNGNGLA"),
      name: ethers.utils.formatBytes32String("ACCESS BANK"),
    };
    const diamondBank = {
      code: ethers.utils.formatBytes32String("DBLNNGLA"),
      name: ethers.utils.formatBytes32String("DIAMOND BANK"),
    }

    await expect(
      paycrest
        .connect(hacker)
        .setSupportedInstitutions(currency, [
          accessBank,
          diamondBank
        ])
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);

    [this.accessBankName, this.currency] =
      await paycrest.getSupportedInstitutionByCode(accessBank.code);
    expect(this.accessBankName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);

    [this.diamondBankName, this.currency] =
      await paycrest.getSupportedInstitutionByCode(diamondBank.code);
    expect(this.diamondBankName).to.eq(zeroIndexBytes);
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
      .to.emit(paycrest, Events.Paycrest.ProtocolFeesUpdated)
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

  it("should update treasury address", async function () {
    await setupAndResetFork();
    const treasury = ethers.utils.formatBytes32String("treasury");

    await expect(
      paycrest
        .connect(admin)
        .updateProtocolAddresses(treasury, treasuryAddress.address)
    ).to.be.emit(paycrest, Events.Paycrest.ProtocolAddressesUpdated);

  });
});
