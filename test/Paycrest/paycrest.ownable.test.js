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
  });

  it("should get supported token", async function () {
    const mockUSDC = await this.paycrest.isTokenSupported(this.mockUSDC.address);
    expect(mockUSDC).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    const mockUSDT = await this.paycrest.isTokenSupported(
      this.mockUSDT.address
    );
    expect(mockUSDT).to.eq(false);
  });


  it("should be able to set supported tokens and emit events", async function () {
    const token = ethers.utils.formatBytes32String("token");
    const invalidParams = ethers.utils.formatBytes32String("tok");

    await expect(
      this.paycrest
        .connect(this.deployer)
        .settingManagerBool(token, this.mockUSDT.address, true)
    )
      .to.emit(this.paycrest, Events.Paycrest.SettingManagerBool)
      .withArgs(token, this.mockUSDT.address, true);

    expect(await this.paycrest.isTokenSupported(this.mockUSDT.address)).to.eq(
      true
    );
  });

  it("should revert when non-owner try to set supported", async function () {
    const token = ethers.utils.formatBytes32String("token");

    await expect(
      this.paycrest
        .connect(this.hacker)
        .settingManagerBool(token, this.mockUSDT.address, true)
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);

    expect(await this.paycrest.isTokenSupported(this.mockUSDT.address)).to.eq(
      false
    );
  });

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
    const currencies = await this.paycrest.getSupportedInstitutions(currency);
    // expect(currencies.length).to.eq(6);
    // console.log("all currencies", currencies);


    [this.firstBankName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(firstBank.code);
    expect(this.firstBankName).to.eq(firstBank.name);
    expect(this.currency).to.eq(currency);
    [this.opayName, this.currency] = await this.paycrest.getSupportedInstitutionName(opay.code);
    expect(this.opayName).to.eq(opay.name);
    expect(this.currency).to.eq(currency);
    [this.palmpayName, this.currency] = await this.paycrest.getSupportedInstitutionName(palmpay.code);
    expect(this.palmpayName).to.eq(palmpay.name);
    expect(this.currency).to.eq(currency);
    [this.accessBankName, this.currency] = await this.paycrest.getSupportedInstitutionName(accessBank.code);
    expect(this.accessBankName).to.eq(accessBank.name);
    expect(this.currency).to.eq(currency);
    [this.gtbName, this.currency] = await this.paycrest.getSupportedInstitutionName(gtb.code);
    expect(this.gtbName).to.eq(gtb.name);
    expect(this.currency).to.eq(currency);
    [this.stanbicName, this.currency] = await this.paycrest.getSupportedInstitutionName(stanbic.code);
    expect(this.stanbicName).to.eq(stanbic.name);
    expect(this.currency).to.eq(currency);
    
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

    [this.firstBankName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(firstBank.code);
    expect(this.firstBankName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.opayName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(opay.code);
    expect(this.opayName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.palmpayName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(palmpay.code);
    expect(this.palmpayName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.accessBankName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(accessBank.code);
    expect(this.accessBankName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.gtbName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(gtb.code);
    expect(this.gtbName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);
    [this.stanbicName, this.currency] =
      await this.paycrest.getSupportedInstitutionName(stanbic.code);
    expect(this.stanbicName).to.eq(zeroIndexBytes);
    expect(this.currency).to.eq(zeroIndexBytes);

  });

  it("should be able to set protocol fees and emit events", async function () {
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);
    const primaryValidatorsFees = BigNumber.from(5_000); // 5%
    const secondaryValidatorsFees = BigNumber.from(3_000); // 3%

    await expect(
      this.paycrest
        .connect(this.deployer)
        .updateProtocolFees(
          protocolFeePercent,
          primaryValidatorsFees,
          secondaryValidatorsFees
        )
    )
      .to.emit(this.paycrest, Events.Paycrest.PaycrestFees)
      .withArgs(protocolFeePercent, primaryValidatorsFees, secondaryValidatorsFees);

    [this.protocolFeePecent, this.primaryvalidatorPercent, this.secondaryValidatorPercent, ] = await this.paycrest.getFeeDetails();
    expect(this.protocolFeePecent).to.eq(protocolFeePercent);
    expect(this.primaryvalidatorPercent).to.eq(primaryValidatorsFees);
    expect(this.secondaryValidatorPercent).to.eq(secondaryValidatorsFees);
  });

  it("should not be able to set protocol fees by non-owner", async function () {
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);
    const primaryValidatorsFees = BigNumber.from(5_000); // 5%
    const secondaryValidatorsFees = BigNumber.from(3_000); // 3%

    await expect(
      this.paycrest
        .connect(this.hacker)
        .updateProtocolFees(
          protocolFeePercent,
          primaryValidatorsFees,
          secondaryValidatorsFees
        )
    )
      .to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update fee recipients, stake contract and aggregator", async function () {
    const fee = ethers.utils.formatBytes32String("fee");
    const aggregator = ethers.utils.formatBytes32String("aggregator");
    const stakeContract = ethers.utils.formatBytes32String("stakeContract");

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(fee, this.feeRecipient.address);
    
    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(aggregator, this.aggregator.address);
    
    expect(await this.paycrest.getLiquidityAggregator()).to.eq(this.aggregator.address);

    await this.paycrest
      .connect(this.deployer)
      .updateFeeRecipient(stakeContract, this.paycrestValidator.address);
  });

});
