// scripts/create-box.js
const { ethers, upgrades, deployments } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");

async function main() {
  const { deployer } = await getNamedAccounts();

  const mockUSDCContractInstance = await deployments.deploy("MockUSDC", {
    contract: "MockUSDC",
    from: deployer,
    log: true,
  });
  console.log("mockUSDCContractInstance", mockUSDCContractInstance.address);

  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(Paycrest, [
    mockUSDCContractInstance.address,
  ]);
  console.log("paycrest deployed to:", await paycrest.address);
  console.log("✅ Deployed Paycrest.");

  const PaycrestValidator = await ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidator = await upgrades.deployProxy(PaycrestValidator, [
    paycrest.address,
  ]);
  console.log(
    "paycrestValidator deployed to:",
    await paycrestValidator.address
  );
  console.log("✅ Deployed paycrestValidator.");

  const protocolFeePercent = BigNumber.from(10_000);
  const validatorFeePercent = BigNumber.from(5_000); // 5%
  const usdcMinimumStakeAmount = ethers.utils.parseUnits("500", 6); // not usdc has 6 decimals

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

  await paycrest.updateProtocolFees(protocolFeePercent, validatorFeePercent);

  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL ADDRESSES ======================================================="
  );
  const fee = ethers.utils.formatBytes32String("fee");
  const aggregatorInit = ethers.utils.formatBytes32String("aggregator");
  const stakeContract = ethers.utils.formatBytes32String("stakeContract");

  await paycrest.updateFeeRecipient(fee, deployer);
  await paycrest.updateFeeRecipient(aggregatorInit, deployer);
  await paycrest.updateFeeRecipient(stakeContract, paycrestValidator.address);

  console.log(
    "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  );

  const whitelist = ethers.utils.formatBytes32String("whitelist");
  await paycrest.settingManagerBool(whitelist, deployer, true);

  await paycrestValidator.setMinimumAmountForTokens(
    mockUSDCContractInstance.address,
    usdcMinimumStakeAmount
  );
}

main();
