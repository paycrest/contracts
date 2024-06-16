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

  it("should be able to set protocol fees and emit events", async function () {
    await setupAndResetFork();
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      gateway
        .connect(admin)
        .updateProtocolFee(protocolFeePercent)
    )
      .to.emit(gateway, Events.Gateway.ProtocolFeeUpdated)
      .withArgs(protocolFeePercent);

    [this.protocolFeePecent, this.MAXBPS] =
      await gateway.getFeeDetails();
    expect(this.protocolFeePecent).to.eq(protocolFeePercent);
  });

  it("should not be able to set protocol fees by non-owner", async function () {
    await setupAndResetFork();
    // charge 10% as protocol fee
    const protocolFeePercent = BigNumber.from(10_000);

    await expect(
      gateway
        .connect(hacker)
        .updateProtocolFee(protocolFeePercent)
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
