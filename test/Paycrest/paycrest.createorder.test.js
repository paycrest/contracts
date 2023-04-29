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

describe("Paycrest create order", function () {
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

});
