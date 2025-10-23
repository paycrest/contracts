const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { gatewayFixture } = require("../fixtures/gateway.js");
require("dotenv").config();

const { Errors, Events } = require("../utils/utils.manager.js");
const { expect } = require("chai");

describe("Ownable settings", function () {
  let gateway;
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
    ({ gateway, mockUSDT } = await gatewayFixture());

    [admin, keeper, alice, hacker, sender, Mark, treasuryAddress, aggregator] =
      await ethers.getSigners();

    const token = ethers.utils.formatBytes32String("token");

    await expect(
      gateway
        .connect(admin)
        .settingManagerBool(token, mockUSDT.address, BigNumber.from(1))
    )
      .to.emit(gateway, Events.Gateway.SettingManagerBool)
      .withArgs(token, mockUSDT.address, BigNumber.from(1));
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const _mockUSDT = await gateway.isTokenSupported(mockUSDT.address);
    expect(_mockUSDT).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const Alice = await gateway.isTokenSupported(alice.address);
    expect(Alice).to.eq(false);
  });

  it("should be able to set token fee settings and emit events", async function () {
    await setupAndResetFork();
    
    await expect(
      gateway
        .connect(admin)
        .setTokenFeeSettings(
          mockUSDT.address,
          BigNumber.from(50000), // senderToProvider: 50%
          BigNumber.from(50000), // providerToAggregator: 50%
          BigNumber.from(0),     // senderToAggregator: 0%
          BigNumber.from(500)    // providerToAggregatorFx: 0.5%
        )
    )
      .to.emit(gateway, Events.Gateway.TokenFeeSettingsUpdated)
      .withArgs(
        mockUSDT.address,
        BigNumber.from(50000),
        BigNumber.from(50000),
        BigNumber.from(0),
        BigNumber.from(500)
      );

    const settings = await gateway.getTokenFeeSettings(mockUSDT.address);
    expect(settings.senderToProvider).to.eq(BigNumber.from(50000));
    expect(settings.providerToAggregator).to.eq(BigNumber.from(50000));
    expect(settings.senderToAggregator).to.eq(BigNumber.from(0));
    expect(settings.providerToAggregatorFx).to.eq(BigNumber.from(500));
  });

  it("should not be able to set token fee settings by non-owner", async function () {
    await setupAndResetFork();

    await expect(
      gateway
        .connect(hacker)
        .setTokenFeeSettings(
          mockUSDT.address,
          BigNumber.from(50000),
          BigNumber.from(50000),
          BigNumber.from(0),
          BigNumber.from(500)
        )
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update treasury address", async function () {
    await setupAndResetFork();
    const treasury = ethers.utils.formatBytes32String("treasury");

    await expect(
      gateway
        .connect(admin)
        .updateProtocolAddress(treasury, treasuryAddress.address)
    ).to.be.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

  });
});
