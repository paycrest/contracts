import { expect } from "chai";
import { ethers } from "../setup.js";
import { gatewayFixture } from "../fixtures/gateway.js";
import { Errors, Events } from "../utils/utils.manager.js";

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
  let mark;

  async function setupAndResetFork() {
    ({ gateway, mockUSDT } = await gatewayFixture());

    [admin, keeper, alice, hacker, sender, mark, treasuryAddress, aggregator] =
      await ethers.getSigners();

    const token = ethers.encodeBytes32String("token");
    const mockUSDTAddress = await mockUSDT.getAddress();

    await expect(
      gateway
        .connect(admin)
        .settingManagerBool(token, mockUSDTAddress, 1n)
    )
      .to.emit(gateway, Events.Gateway.SettingManagerBool)
      .withArgs(token, mockUSDTAddress, 1n);
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const _mockUSDT = await gateway.isTokenSupported(await mockUSDT.getAddress());
    expect(_mockUSDT).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const unsupportedToken = await gateway.isTokenSupported(alice.address);
    expect(unsupportedToken).to.eq(false);
  });

  it("should be able to set token fee settings and emit events", async function () {
    await setupAndResetFork();
    
    const mockUSDTAddress = await mockUSDT.getAddress();
    
    await expect(
      gateway
        .connect(admin)
        .setTokenFeeSettings(
          mockUSDTAddress,
          50000n, // senderToProvider: 50%
          50000n, // providerToAggregator: 50%
          0n,     // senderToAggregator: 0%
          500n    // providerToAggregatorFx: 0.5%
        )
    )
      .to.emit(gateway, Events.Gateway.TokenFeeSettingsUpdated)
      .withArgs(
        mockUSDTAddress,
        50000n,
        50000n,
        0n,
        500n
      );

    const settings = await gateway.getTokenFeeSettings(mockUSDTAddress);
    expect(settings.senderToProvider).to.eq(50000n);
    expect(settings.providerToAggregator).to.eq(50000n);
    expect(settings.senderToAggregator).to.eq(0n);
    expect(settings.providerToAggregatorFx).to.eq(500n);
  });

  it("should not be able to set token fee settings by non-owner", async function () {
    await setupAndResetFork();

    await expect(
      gateway
        .connect(hacker)
        .setTokenFeeSettings(
          await mockUSDT.getAddress(),
          50000n,
          50000n,
          0n,
          500n
        )
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update treasury address", async function () {
    await setupAndResetFork();
    const treasury = ethers.encodeBytes32String("treasury");

    await expect(
      gateway
        .connect(admin)
        .updateProtocolAddress(treasury, treasuryAddress.address)
    ).to.be.emit(gateway, Events.Gateway.ProtocolAddressUpdated);

  });
});
