// scripts/create-box.js
const { ethers, upgrades, deployments } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const CryptoJS = require("crypto-js");
const crypto1 = require("crypto");

const crypto = globalThis.crypto;

async function main() {
  const { deployer } = await getNamedAccounts();
  const _mockUSDC = "0x5219273AD683d068b35ccD59F81A20f7bE233229";
  const baseTestUSDC = "0x8f5f9Be9193B2421143f1904FB543F4DD0c47477";
  const basePaycrest = "0xd7BD20A48430F6207d87D75E037820F63C174b96";
  const _paycrest = "0x3fE1246CbC4eDf2A4f51f7CF442277bA863823e1";

  // const DERC20_Token = "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1";
  // const mockUSDC = await ethers.getContractAt("MockUSDC", _mockUSDC);

  // deploy MockUSDC contract
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  console.log("mockUSDC deployed to:", mockUSDC.address);
  console.log("✅ Deployed MockUSDC.");

  // console.log("DERC20_Contract_Instance", DERC20_Contract_Instance.address);

  // check balance of deployer in DERC20_Contract_Instance
  const deployerBalance = await mockUSDC.balanceOf(deployer);
  console.log("deployerBalance", deployerBalance.toString());

  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(Paycrest, [mockUSDC.address]);
  // const paycrest = await ethers.getContractAt("Paycrest", _paycrest);
  console.log("paycrest deployed to:", await paycrest.address);
  console.log("✅ Deployed Paycrest.");

  // const paycrest = await ethers.getContractAt(
  //   "Paycrest",
  //   "0x8759Aa5d49CcBC659F7c62C6458EbEAD2E188cC9"
  // );

  const protocolFeePercent = BigNumber.from(10_000);

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

  await paycrest.updateProtocolFees(protocolFeePercent);

  console.log(
    "======================================================= SETTING MANAGER FOR PROTOCOL ADDRESSES ======================================================="
  );
  const fee = ethers.utils.formatBytes32String("fee");
  const aggregatorInit = ethers.utils.formatBytes32String("aggregator");

  await paycrest.updateProtocolAddresses(fee, deployer);
  await paycrest.updateProtocolAddresses(aggregatorInit, deployer);

  console.log(
    "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  );

  // deployer approving paycrest contract to spend DERC20_Contract_Instance
  await mockUSDC.approve(paycrest.address, deployerBalance);

  // create order
  const amount = ethers.utils.parseUnits("1", 15);

  const data = [
    { bank_account: "09090990901" },
    { bank_name: "opay" },
    { accoun_name: "opay opay" },
  ];
  const password = "h9wt*pasj6796jw(w8=xaje8tpi6+k2)";

  // const cipher = CryptoJS.AES.encrypt(
  //   JSON.stringify(data),
  //   password
  // ).toString();
  const nonce = CryptoJS.lib.WordArray.random(12);
  // console.log("nonce", CryptoJS.mode);

  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(data), password, {
    nonce: nonce,
    // mode: CryptoJS.mode.GCM,
    padding: CryptoJS.pad.NoPadding,
  });

  await paycrest.updateProtocolAggregator(
    "0x04a968c0e48766755767c887d84bed248f3b671e2400fb08402a03b231d11960d60a3078cbe0c21d5c7c6d0ba8d9cabfe12f1d3230af048b58fea6831719fe1b17"
  );

  const messageHash =
    "0xa3c6bfc43a5f2297001a72039b835698bae96310babf9ff34acc52ad530316f37b961cdf6b119f9422a424b9ad4ac949e282c276131fa7820535a01eb7703cd76350a190e1b6ee4ecc84f6a0f7d090b52e1f565319af139a557fab64b027427e1812576dbfd6c5a2e95166c9a0bc02e967a45be472259572e166758c7865cdc24255f200de23f84f1ac1cc8035b1";

  await paycrest.createOrder(
    mockUSDC.address,
    amount,
    ethers.utils.formatBytes32String("191"),
    ethers.utils.formatBytes32String("191"),
    970,
    deployer,
    0,
    deployer,
    messageHash.toString()
  );
}

main();
