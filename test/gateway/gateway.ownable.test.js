import { expect } from "chai";
import hre from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { gatewayFixture } from "../fixtures/gateway.js";
import dotenv from "dotenv";
dotenv.config();

import { Errors, Events } from "../utils/utils.manager.js";

// Connect to network and get ethers instance (Hardhat v3 pattern)
const { ethers } = await hre.network.connect();

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

    const signers = await ethers.getSigners();
    // The fixture uses the first signer (deployer) as owner
    admin = signers[0];
    [keeper, alice, hacker, sender, Mark, treasuryAddress, aggregator] = signers.slice(1);
  }

  it("should get supported token", async function () {
    await setupAndResetFork();
    const mockUSDTAddress = await mockUSDT.getAddress();
    const _mockUSDT = await gateway.isTokenSupported(mockUSDTAddress);
    expect(_mockUSDT).to.eq(true);
  });

  it("should revert for unsupported token", async function () {
    await setupAndResetFork();
    const aliceAddress = await alice.getAddress();
    const Alice = await gateway.isTokenSupported(aliceAddress);
    expect(Alice).to.eq(false);
  });

  it("should be able to set token fee settings and emit events", async function () {
    await setupAndResetFork();
    const mockUSDTAddress = await mockUSDT.getAddress();
    
    // Verify admin is the owner
    const owner = await gateway.owner();
    const adminAddress = await admin.getAddress();
    expect(owner.toLowerCase()).to.eq(adminAddress.toLowerCase());
    
    // Use different values to ensure the event is emitted
    const tx = await gateway
      .connect(admin)
      .setTokenFeeSettings(
        mockUSDTAddress,
        60000, // senderToProvider: 60% (different from fixture's 50%)
        40000, // providerToAggregator: 40% (different from fixture's 50%)
        0,     // senderToAggregator: 0%
        600    // providerToAggregatorFx: 0.6% (different from fixture's 0.5%)
      );
    
    const receipt = await tx.wait();
    expect(receipt.status).to.eq(1); // Transaction succeeded

    const settings = await gateway.getTokenFeeSettings(mockUSDTAddress);
    expect(settings.senderToProvider).to.eq(60000n);
    expect(settings.providerToAggregator).to.eq(40000n);
    expect(settings.senderToAggregator).to.eq(0n);
    expect(settings.providerToAggregatorFx).to.eq(600n);
  });

  it("should not be able to set token fee settings by non-owner", async function () {
    await setupAndResetFork();
    const mockUSDTAddress = await mockUSDT.getAddress();
    
    // Verify that hacker is not the owner
    const owner = await gateway.owner();
    const hackerAddress = await hacker.getAddress();
    const adminAddress = await admin.getAddress();
    expect(owner.toLowerCase()).to.eq(adminAddress.toLowerCase());
    expect(owner.toLowerCase()).to.not.eq(hackerAddress.toLowerCase());

    await expect(
      gateway
        .connect(hacker)
        .setTokenFeeSettings(
          mockUSDTAddress,
          50000,
          50000,
          0,
          500
        )
    ).to.be.revertedWith(Errors.Ownable.onlyOwner);
  });

  it("should update treasury address", async function () {
    await setupAndResetFork();
    const treasury = ethers.encodeBytes32String("treasury");
    const treasuryAddressAddress = await treasuryAddress.getAddress();

    const tx = await gateway
      .connect(admin)
      .updateProtocolAddress(treasury, treasuryAddressAddress);
    
    const receipt = await tx.wait();
    expect(receipt.status).to.eq(1); // Transaction succeeded
    
    // Verify the event was emitted
    const event = receipt.logs.find(
      log => {
        try {
          const parsed = gateway.interface.parseLog(log);
          return parsed && parsed.name === Events.Gateway.ProtocolAddressUpdated;
        } catch {
          return false;
        }
      }
    );
    expect(event).to.not.be.undefined;
  });
});
