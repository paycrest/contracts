const { ethers, upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { NETWORKS } = require("../../scripts/config.js");
const { BigNumber } = require("@ethersproject/bignumber");
const { paycrestFixture } = require("./paycrest.js");
const chainId = 42161;
const { USDC_ADDRESS, USDT_ADDRESS, IMPERSONATE_ACCOUNT } = NETWORKS[chainId];

async function paycrestValidator() {
  const { paycrest } = await paycrestFixture();
  const [admin, feeRecipient, aggregator, ...users] = await hre.ethers.getSigners();
  const paycrestValidatorFactory = await hardhat.ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidator = await upgrades.deployProxy(
    paycrestValidatorFactory,
    [paycrest.address]
  );
  await paycrestValidator.deployed();
  console.log("paycrest Validator deployed to:", paycrestValidator.address);

  const usdt = await hardhat.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    USDT_ADDRESS
  );

  const usdc = await hardhat.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    USDC_ADDRESS
  );

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [IMPERSONATE_ACCOUNT],
  });
  const impersonator = ethers.provider.getSigner(IMPERSONATE_ACCOUNT);

  return {
    paycrestValidator,
    paycrest,
    usdc,
    usdt,
    impersonator,
    admin,
    feeRecipient,
    aggregator,
    users
  };
}

const paycrestValidatorFixture =
  hardhat.deployments.createFixture(paycrestValidator);

module.exports = {
  paycrestValidatorFixture,
};
