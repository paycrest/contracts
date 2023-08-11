const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const {
  paycrestValidatorFixture,
} = require("../fixtures/paycrestValidator.js");
require("dotenv").config();
let { ALCHEMY_KEY } = process.env;
const { network } = require("hardhat");

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
  let paycrestValidator;;
  let paycrest;
  let usdc;
  let usdt;
  let impersonator;
  let admin;
  let feeRecipient;
  let aggregator;
  let users;
  let keeper;
  let alice;
  let hacker;
  let sender;
  let Mark;



  async function setupAndResetFork() {
    console.log("Forking");
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
            // current only works on this block
            blockNumber: 46185793,
          },
        },
      ],
    });
    console.log("Fork reset");

    ({
      paycrestValidator,
      paycrest,
      usdc,
      usdt,
      impersonator,
      admin,
      feeRecipient,
      aggregator,
      users,
    } = await paycrestValidatorFixture());
    console.log("Fixtures deployed");

    [keeper, alice, hacker, sender, Mark] =
      users;
    
    // [
    //   this.deployer,
    //   this.feeRecipient,
    //   this.keeper,
    //   this.aggregator,
    //   this.alice,
    //   this.hacker,
    //   this.sender,
    //   ...this.accounts
    // ] = await ethers.getSigners();

    // aliceAmountBN = ethers.utils.parseUnits("5000", 6);
    // bobAmountBN = ethers.utils.parseUnits("5000", 6);
    // markAmountBN = ethers.utils.parseUnits("5000", 6);
    // eveAmountBN = ethers.utils.parseUnits("1000", 6);
    // jackAmountBN = ethers.utils.parseUnits("500", 6);
    // eveLeverage = ethers.BigNumber.from("9000");
    // jackLeverage = ethers.BigNumber.from("2000");

    // await usdc.connect(impersonator).transfer(Alice.address, aliceAmountBN);
    // await usdc.connect(impersonator).transfer(Bob.address, bobAmountBN);
    // await usdc.connect(impersonator).transfer(Eve.address, eveAmountBN);
    // await usdc.connect(impersonator).transfer(Jack.address, jackAmountBN);
    // await usdc.connect(impersonator).transfer(Mark.address, markAmountBN);

    // await usdc.connect(Alice).approve(waterVault.address, aliceAmountBN);
    // await usdc.connect(Bob).approve(waterVault.address, bobAmountBN);
    // await usdc.connect(Mark).approve(waterVault.address, markAmountBN);

    // await usdc.connect(Eve).approve(maotaiVault.address, eveAmountBN);
    // await usdc.connect(Jack).approve(maotaiVault.address, jackAmountBN);
    // await waterVault.connect(Alice).deposit(aliceAmountBN, Alice.address);
    // await waterVault.connect(Bob).deposit(bobAmountBN, Bob.address);
    // await waterVault.connect(Mark).deposit(markAmountBN, Mark.address);
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const mockUSDC = await paycrest.isTokenSupported(usdc.address);
    expect(mockUSDC).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const mockUSDT = await paycrest.isTokenSupported(
      usdt.address
    );
    expect(mockUSDT).to.eq(false);
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

    expect(await paycrest.getWhitelistedStatus(sender.address)).to.eq(
      true
    );
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
        ])
    const currencies = await paycrest.getSupportedInstitutions(currency);
    // expect(currencies.length).to.eq(6);
    // console.log("all currencies", currencies);

    [this.firstBankName, this.currency] =
      await paycrest.getSupportedInstitutionName(firstBank.code);
    expect(this.firstBankName).to.eq(firstBank.name);
    expect(this.currency).to.eq(currency);
    [this.opayName, this.currency] = await paycrest.getSupportedInstitutionName(opay.code);
    expect(this.opayName).to.eq(opay.name);
    expect(this.currency).to.eq(currency);
    [this.palmpayName, this.currency] = await paycrest.getSupportedInstitutionName(palmpay.code);
    expect(this.palmpayName).to.eq(palmpay.name);
    expect(this.currency).to.eq(currency);
    [this.accessBankName, this.currency] = await paycrest.getSupportedInstitutionName(accessBank.code);
    expect(this.accessBankName).to.eq(accessBank.name);
    expect(this.currency).to.eq(currency);
    [this.gtbName, this.currency] = await paycrest.getSupportedInstitutionName(gtb.code);
    expect(this.gtbName).to.eq(gtb.name);
    expect(this.currency).to.eq(currency);
    [this.stanbicName, this.currency] = await paycrest.getSupportedInstitutionName(stanbic.code);
    expect(this.stanbicName).to.eq(stanbic.name);
    expect(this.currency).to.eq(currency);

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
    [this.opayName, this.currency] =
      await paycrest.getSupportedInstitutionName(opay.code);
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
    [this.gtbName, this.currency] =
      await paycrest.getSupportedInstitutionName(gtb.code);
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
    const primaryValidatorsFees = BigNumber.from(5_000); // 5%
    const secondaryValidatorsFees = BigNumber.from(3_000); // 3%

    await expect(
      paycrest
        .connect(admin)
        .updateProtocolFees(
          protocolFeePercent,
          primaryValidatorsFees,
          secondaryValidatorsFees
        )
    )
      .to.emit(paycrest, Events.Paycrest.PaycrestFees)
      .withArgs(protocolFeePercent, primaryValidatorsFees, secondaryValidatorsFees);

    [this.protocolFeePecent, this.primaryvalidatorPercent, this.secondaryValidatorPercent, ] = await paycrest.getFeeDetails();
    expect(this.protocolFeePecent).to.eq(protocolFeePercent);
    expect(this.primaryvalidatorPercent).to.eq(primaryValidatorsFees);
    expect(this.secondaryValidatorPercent).to.eq(secondaryValidatorsFees);
  });

  it("should not be able to set protocol fees by non-owner", async function () {
    await setupAndResetFork();
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);
    const primaryValidatorsFees = BigNumber.from(5_000); // 5%
    const secondaryValidatorsFees = BigNumber.from(3_000); // 3%

    await expect(
      paycrest
        .connect(hacker)
        .updateProtocolFees(
          protocolFeePercent,
          primaryValidatorsFees,
          secondaryValidatorsFees
        )
    )
      .to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update fee recipients, stake contract and aggregator", async function () {
    await setupAndResetFork();
    const fee = ethers.utils.formatBytes32String("fee");
    const _aggregator = ethers.utils.formatBytes32String("aggregator");
    const stakeContract = ethers.utils.formatBytes32String("stakeContract");

    await paycrest
      .connect(admin)
      .updateFeeRecipient(fee, feeRecipient.address);

    await paycrest
      .connect(admin)
      .updateFeeRecipient(_aggregator, aggregator.address);

    expect(await paycrest.getLiquidityAggregator()).to.eq(aggregator.address);

    await paycrest
      .connect(admin)
      .updateFeeRecipient(stakeContract, paycrestValidator.address);
  });
});
