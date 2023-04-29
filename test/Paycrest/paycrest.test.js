const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const {
  deployContract,
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  FEE_BPS,
  Errors,
  Events,
} = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Ownable settings", function () {
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
    this.paycrest = await deployContract("Paycrest", [this.mockUSDC.address]);
    this.paycrestValidator = await deployContract("PaycrestValidator", [
      this.paycrest.address,
    ]);

    // const fee = ethers.utils.formatBytes32String("fee");
  });

  // it("should get supported token", async function () {
  //   const mockUSDC = await this.paycrest.isTokenSupported(this.mockUSDC.address);
  //   expect(mockUSDC).to.eq(true);
  // });

  // it("should revert for unsupported token", async function () {
  //   const mockUSDC = await this.paycrest.isTokenSupported(
  //     this.mockUSDCT.address
  //   );
  //   expect(mockUSDC).to.eq(false);
  // });


  // it("should be able to set supported tokens and emit events", async function () {
  //   const token = ethers.utils.formatBytes32String("token");
  //   const invalidParams = ethers.utils.formatBytes32String("tok");

  //   await expect(
  //     this.paycrest
  //       .connect(this.deployer)
  //       .settingManagerBool(token, this.mockUSDCT.address, true)
  //   )
  //     .to.emit(this.paycrest, Events.Paycrest.SettingManagerBool)
  //     .withArgs(token, this.mockUSDCT.address, true);

  //   const isTokenSupported = await this.paycrest.isTokenSupported(
  //     this.mockUSDC.address
  //   );
  //   expect(isTokenSupported).to.eq(true);
  // });

  // it("should revert when non-owner try to set supported", async function () {
  //   const token = ethers.utils.formatBytes32String("token");

  //   await expect(
  //     this.paycrest
  //       .connect(this.hacker)
  //       .settingManagerBool(token, this.mockUSDCT.address, true)
  //   ).to.be.revertedWith(Errors.Ownable.onlyOwner);

  //   const isTokenSupported = await this.paycrest.isTokenSupported(
  //     this.mockUSDCT.address
  //   );
  //   expect(isTokenSupported).to.eq(false);
  // });

  it("should be able to set supported arrays of Institution", async function () {
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
      this.paycrest
        .connect(this.deployer)
        .setSupportedInstitutions(currency, [
          firstBank,
          opay,
          palmpay,
          accessBank,
          gtb,
          stanbic,
        ])
    // );
    // @todo check if the array is set
    const currencies = await this.paycrest.getSupportedInstitutions(currency);
    console.log("all currencies", currencies);
    
    console.log(
      "currencies",
      await this.paycrest.getSupportedInstitutions(currency)
    );

    const getSupportedNameForFirstBank = await this.paycrest.getSupportedName(
      firstBank.code
    );
    expect(getSupportedNameForFirstBank).to.eq(firstBank.name);
    const getSupportedNameForOpay = await this.paycrest.getSupportedName(opay.code);
    expect(getSupportedNameForOpay).to.eq(opay.name);
    const getSupportedNameForPalmpay = await this.paycrest.getSupportedName(palmpay.code);
    expect(getSupportedNameForPalmpay).to.eq(palmpay.name);
    const getSupportedNameForAccessBank = await this.paycrest.getSupportedName(accessBank.code);
    expect(getSupportedNameForAccessBank).to.eq(accessBank.name);
    const getSupportedNameForGtb = await this.paycrest.getSupportedName(gtb.code);
    expect(getSupportedNameForGtb).to.eq(gtb.name);

    // [this.firstBank, this.opay, this.palmpay, this.accessBank, this.gtb, this.stanbic]
  });

  it("should revert when non-owner want to set Institution", async function () {
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
      this.paycrest
        .connect(this.hacker)
        .setSupportedInstitutions(currency, [
          firstBank,
          opay,
          palmpay,
          accessBank,
          gtb,
          stanbic,
        ])
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);

    const getSupportedNameForFirstBank = await this.paycrest.getSupportedName(
      firstBank.code
    );
    expect(getSupportedNameForFirstBank).to.eq(zeroIndexBytes);
    const getSupportedNameForOpay = await this.paycrest.getSupportedName(
      opay.code
    );
    expect(getSupportedNameForOpay).to.eq(zeroIndexBytes);
    const getSupportedNameForPalmpay = await this.paycrest.getSupportedName(
      palmpay.code
    );
    expect(getSupportedNameForPalmpay).to.eq(zeroIndexBytes);
    const getSupportedNameForAccessBank = await this.paycrest.getSupportedName(
      accessBank.code
    );
    expect(getSupportedNameForAccessBank).to.eq(zeroIndexBytes);
    const getSupportedNameForGtb = await this.paycrest.getSupportedName(
      gtb.code
    );
    expect(getSupportedNameForGtb).to.eq(zeroIndexBytes);
  });

  // it("should be able to set protocol fees and emit events", async function () {
  //   // charge 10% as protocol fee
  //   const protocolFeePercent = BigNumber.from(10_000);
  //   const primaryValidatorsFees = BigNumber.from(5_000); // 5%
  //   const secondaryValidatorsFees = BigNumber.from(3_000); // 3%

  //   await expect(
  //     this.paycrest
  //       .connect(this.deployer)
  //       .updateProtocolFees(
  //         protocolFeePercent,
  //         primaryValidatorsFees,
  //         secondaryValidatorsFees
  //       )
  //   )
  //     .to.emit(this.paycrest, Events.Paycrest.PaycrestFees)
  //     .withArgs(protocolFeePercent, primaryValidatorsFees, secondaryValidatorsFees);

  //   const fees = await this.paycrest.getFeeDetails();
  //   console.log("fees", fees.toString());
  //   // expect(this.protocolFees).to.eq(protocolFeePercent);
  //   // expect(this.primaryValidiatorFee).to.eq(primaryValidatorsFees);
  //   // expect(this.secondaryValidatorsFees).to.eq(secondaryValidatorsFees);
  // });

  // it("should update fee recipients, stake contract and aggregator", async function () {
  //   const fee = ethers.utils.formatBytes32String("fee");
  //   const aggregator = ethers.utils.formatBytes32String("aggregator");
  //   const stakeContract = ethers.utils.formatBytes32String("stakeContract");

  //   await expect(
  //     this.paycrest
  //       .connect(this.deployer)
  //       .settingManagerBool(fee, this.feeRecipient.address)
  //   )

    // const isTokenSupported = await this.paycrest.isTokenSupported(
    //   this.mockUSDCT.address
    // );
    // expect(isTokenSupported).to.eq(false);
  // });

});
