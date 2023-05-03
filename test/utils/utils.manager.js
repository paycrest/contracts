const { ethers } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");

const ZERO_AMOUNT = BigNumber.from("0");
const ZERO_ADDRESS = ethers.constants.AddressZero;
const MAX_BPS = BigNumber.from("100000");
const FEE_BPS = BigNumber.from("500");

const Errors = {
  Ownable: {
    onlyOwner: "Ownable: caller is not the owner",
  },

  Paycrest: {
    OnlyAggregator: "OnlyAggregator",
    InvalidSigner: "InvalidSigner",
    Unsuported: "Unsuported",
    OrderFulfilled: "OrderFulfilled",
    UnableToProcessRewards: "UnableToProcessRewards",
    InvalidInstitutionCode: "InvalidInstitutionCode",
  },

  PaycrestValidators: {
    ThrowInitPaused: "ThrowInitPaused",
    TokenNotSupported: "TokenNotSupported",
    MinimumRequired: "MinimumRequired",
    Insufficient: "Insufficient",
  },
};

const Events = {
  Paycrest: {
    Deposit: "Deposit",
    Settled: "Settled",
    Refunded: "Refunded",
  },

  PaycrestValidators: {
    NewTokenSupported: "NewTokenSupported",
    Initialized: "Initialized",
    Staked: "Staked",
    Withdrawn: "Withdrawn",
    RewardValidators: "RewardValidators",
  },
};

async function deployContract(name, args = [], value = 0) {
  // if (!name) throw new Error("Cannot be null");
  // if (value < 0) throw new Error("Invalid value");

  const Contract = await ethers.getContractFactory(name);
  let instance;

  if (value > 0) instance = await Contract.deploy(...args, { value });
  else instance = await Contract.deploy(...args);
  return instance;
}

async function mockMintDeposit(water, account, usdc, amount) {
  await usdc.connect(account).mint(amount);
  await usdc.connect(account).approve(water.address, amount);
  await water.connect(account).deposit(amount, account.address);
}

module.exports = {
  ZERO_AMOUNT,
  ZERO_ADDRESS,
  MAX_BPS,
  FEE_BPS,
  Errors,
  Events,
  deployContract,
  mockMintDeposit,
};
