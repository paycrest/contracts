// scripts/create-box.js
const { ethers, upgrades, deployments } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");

async function main() {
  const { deployer } = await getNamedAccounts();

  const DERC20_Token = "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1";
  const DERC20_Contract_Instance = await ethers.getContractAt(
    "MockUSDC",
    DERC20_Token
  );

  console.log("DERC20_Contract_Instance", DERC20_Contract_Instance.address);

  // check balance of deployer in DERC20_Contract_Instance
  const deployerBalance = await DERC20_Contract_Instance.balanceOf(deployer);
  console.log("deployerBalance", deployerBalance.toString());

  // const Paycrest = await ethers.getContractFactory("Paycrest");
  // const paycrest = await upgrades.deployProxy(Paycrest, [DERC20_Token]);
  // console.log("paycrest deployed to:", await paycrest.address);
  // console.log("✅ Deployed Paycrest.");

  // const PaycrestValidator = await ethers.getContractFactory(
  //   "PaycrestValidator"
  // );
  // const paycrestValidator = await upgrades.deployProxy(PaycrestValidator, [
  //   paycrest.address,
  // ]);

  const paycrest = await ethers.getContractAt(
    "Paycrest",
    "0x643db3aa8adDFd1877453491d144aD184cf8261b"
  );

  // console.log(
  //   "paycrestValidator deployed to:",
  //   paycrestValidator.address
  // );
  // console.log("✅ Deployed paycrestValidator.");

  const protocolFeePercent = BigNumber.from(10_000);
  const validatorFeePercent = BigNumber.from(5_000); // 5%
  const usdcMinimumStakeAmount = ethers.utils.parseUnits("1", 12); // not usdc has 6 decimals

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

  // await paycrest.setSupportedInstitutions(currency, [
  //   firstBank,
  //   opay,
  //   palmpay,
  //   accessBank,
  //   gtb,
  //   stanbic,
  // ]);
  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL FEES RECIPIENTS ======================================================="
  );

  // await paycrest.updateProtocolFees(protocolFeePercent, validatorFeePercent);

  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL ADDRESSES ======================================================="
  );
  // const fee = ethers.utils.formatBytes32String("fee");
  // const aggregatorInit = ethers.utils.formatBytes32String("aggregator");
  // const stakeContract = ethers.utils.formatBytes32String("stakeContract");

  // await paycrest.updateFeeRecipient(fee, deployer);
  // await paycrest.updateFeeRecipient(aggregatorInit, deployer);
  // await paycrest.updateFeeRecipient(stakeContract, paycrestValidator.address);

  console.log(
    "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  );

  const whitelist = ethers.utils.formatBytes32String("whitelist");

  // await paycrestValidator.setMinimumAmountForTokens(
  //   DERC20_Contract_Instance.address,
  //   usdcMinimumStakeAmount
  // );

  // deployer approving paycrest contract to spend DERC20_Contract_Instance
  await DERC20_Contract_Instance.approve(paycrest.address, deployerBalance);

  // create order
  const amount = ethers.utils.parseUnits("1", 15);

  const data = [
    { bank_account: "09090990901" },
    { bank_name: "opay" },
    { accoun_name: "opay opay" },
  ];
  const password = "123";

  const cipher = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    password
  ).toString();

  const messageHash = "0x" + cipher;
  console.log("messageHash", messageHash);

  await paycrest.createOrder(
    DERC20_Contract_Instance.address,
    amount,
    ethers.utils.formatBytes32String("191"),
    970,
    deployer,
    0,
    deployer,
    messageHash.toString()
  );
}

main();
