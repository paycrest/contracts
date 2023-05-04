const { ethers } = require("hardhat");
const { NETWORKS } = require("./config");
const fs = require("fs");
const path = require("path");
const { BigNumber } = require("@ethersproject/bignumber");

require("dotenv").config();
const { DEPLOYER_PRIVATE_KEY, FEE_RECIPIENT_PRIVATE_KEY } = process.env;

async function deployPaycrest(USDC_ADDRESS) {
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await Paycrest.deploy(USDC_ADDRESS);
  return paycrest;
}

async function deployValidator(paycrest) {
  const PaycrestValidator = await ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidator = await PaycrestValidator.deploy(paycrest);
  return paycrestValidator;
}

async function main() {
  const [deployer, aggregator, feeRecipient] = await ethers.getSigners();

  const feeRecipientAddress = new ethers.Wallet(
    FEE_RECIPIENT_PRIVATE_KEY ?? feeRecipient
  ).address;

  const { chainId } = await ethers.provider.getNetwork();
  const dirResolver = path.resolve(__dirname + `/deployment-${chainId}.json`);

  // @todo move all initialization into the utils file
  const USDC_ADDRESS = NETWORKS[chainId]["USDC_ADDRESS"];
  const protocolFeePercent = BigNumber.from(10_000);
  const primaryValidatorsFees = BigNumber.from(5_000); // 5%
  const secondaryValidatorsFees = BigNumber.from(3_000); // 3%
  const usdcMinimumStakeAmount = ethers.utils.parseUnits("500", 6); // not usdc has 6 decimals

  console.log(
    "======================================================= DEPLOYING PAYCREST ======================================================="
  );

  const paycrest = await deployPaycrest(USDC_ADDRESS);

  console.log(
    "======================================================= DEPLOYING PAYCREST VALIDATORS ======================================================="
  );

  const paycrestValidator = await deployValidator(paycrest.address);

  console.log(
    "======================================================= SETTING MANAGER FOR SUPPORTED INSTITUTIONS ======================================================="
  );
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

  await paycrest.setSupportedInstitutions(currency, [
    firstBank,
    opay,
    palmpay,
    accessBank,
    gtb,
    stanbic,
  ]);
  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL FEES RECIPIENTS ======================================================="
  );

  await paycrest.updateProtocolFees(
    protocolFeePercent,
    primaryValidatorsFees,
    secondaryValidatorsFees
  );

  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL ADDRESSES ======================================================="
  );
  const fee = ethers.utils.formatBytes32String("fee");
  const aggregatorInit = ethers.utils.formatBytes32String("aggregator");
  const stakeContract = ethers.utils.formatBytes32String("stakeContract");

  await paycrest.settingManagerBool(fee, this.feeRecipient.address);
  await paycrest.settingManagerBool(aggregatorInit, this.aggregator.address);
  await paycrest.settingManagerBool(stakeContract, this.stakeContract.address);

  console.log(
    "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  );

  await paycrestValidator.setMinimumAmountForTokens(
    USDC_ADDRESS,
    usdcMinimumStakeAmount
  );

  fs.access(dirResolver, fs.F_OK, (err) => {
    if (err) {
      fs.writeFileSync(dirResolver, JSON.stringify(NETWORKS, null, 4));
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
