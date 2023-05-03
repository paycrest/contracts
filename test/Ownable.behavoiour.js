const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const {
  deployContract,
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  FEE_BPS,
  Errors,
  Events,
} = require("./utils/utils.manager.js");
const { expect } = require("chai");

describe("Ownable settings", function () {
  beforeEach(async function () {
    [
      this.deployer,
      this.feeRecipient,
      this.keeper,
      this.alice,
      ...this.accounts
    ] = await ethers.getSigners();

    this.mockUSDC = await deployContract("MockUSDC");
    this.paycrest = await deployContract("Paycrest", [this.mockUSDC.address]);
    this.paycrestValidator = await deployContract("PaycrestValidator", [
      this.paycrest.address,
    ]);

    // const fee = ethers.utils.formatBytes32String("fee");
  });

  it("should get the fee status", async function () {
    const mockUSDC = await this.paycrest.isTokenSupported(this.mockUSDC.address);
    expect(mockUSDC).to.eq(true);
    console.log("mockUSDC", mockUSDC);
  });

  it("should be able to set supported tokens", async function () {
    const token = ethers.utils.formatBytes32String("token");
    const invalidParams = ethers.utils.formatBytes32String("tok");

    await expect(
      this.paycrest
        .connect(this.deployer)
        .settingManagerBool(token, true, this.mockUSDC.address)
    )
      .to.emit(this.bartender, Events.Paycrest.SettingManagerBool)
      .withArgs(token, true, this.mockUSDC.address);

    const isTokenSupported = await this.paycrest.isTokenSupported(
      this.mockUSDC.address
    );
    expect(isTokenSupported).to.eq(true);
  });

  // it("should revert when non-owner try to set supported", async function () {
  //   const token = ethers.utils.formatBytes32String("token");

  //   await expect(
  //     this.paycrest
  //       .connect(this.alice)
  //       .settingManagerBool(token, true, this.mockUSDC.address)
  //   ).to.be.revertedWithCustomError(this.paycrest, Errors.Ownable.onlyOwner);

  //   const isTokenSupported = await this.paycrest.isTokenSupported(
  //     this.mockUSDC.address
  //   );
  //   expect(isTokenSupported).to.eq(false);
  // });

  // it("should be able to set supported tokens", async function () {
  //   const invalidParams = ethers.utils.formatBytes32String("tok");

  //   await expect(
  //     this.paycrest
  //       .connect(this.deployer)
  //       .settingManagerBool(invalidParams, true, this.mockUSDC.address)
  //   ).to.be.revertedWithCustomError(
  //     this.paycrest,
  //     Errors.Paycrest.InvalidParameter
  //   );

  //   const isTokenSupported = await this.paycrest.isTokenSupported(
  //     this.mockUSDC.address
  //   );
  //   expect(isTokenSupported).to.eq(true);
  // });

  // // test for supported institution for `setSupportedInstitutions`
  // it("should be able to set supported institutions", async function () {
  //   const currency = ethers.utils.formatBytes32String("NGN");

  //   const institution = {
  //     code: ethers.utils.formatBytes32String("Opay"),
  //     name: ethers.utils.formatBytes32String("Opay"),
  //   };
  //   const institution1 = {
  //     code: ethers.utils.formatBytes32String("Zenith"),
  //     name: ethers.utils.formatBytes32String("Zenith Bank"),
  //   };
  //   const institution2 = {
  //     code: ethers.utils.formatBytes32String("First"),
  //     name: ethers.utils.formatBytes32String("First Bank"),
  //   };
  //   const institutions = [institution, institution1, institution2];

  //   await expect(
  //     this.paycrest
  //       .connect(this.deployer)
  //       .setSupportedInstitutions(currency, institutions)
  //   );

  //   const getSupportedToken = await this.paycrest.getSupportedName(institution.code);
  //   expect(getSupportedToken.length).to.eq(institution.name);

  //   const getSupportedInstitutions =
  //     await this.paycrest.getSupportedInstitutions(currency);
  //   expect(getSupportedInstitutions.length).to.eq(3);

  // });
});
