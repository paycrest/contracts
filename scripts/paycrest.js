const { ethers } = require("hardhat");
const { NETWORKS } = require("./config");
const fs = require("fs");
const path = require("path");
const { BigNumber } = require("@ethersproject/bignumber");

require("dotenv").config();
const { AGGREGATOR_ADDRESS, FEE_COLLECTOR_ADDRESS } = process.env;

async function deployUSDC() {
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  console.log("mockUSDC deployed to:", mockUSDC.address)
  return mockUSDC;
}

async function deployPaycrest(USDC_ADDRESS) {
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await Paycrest.deploy(USDC_ADDRESS);
  console.log("paycrest deployed to:", paycrest.address)
  return paycrest;
}

async function deployValidator(paycrest) {
  const PaycrestValidator = await ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidator = await PaycrestValidator.deploy(paycrest);
  console.log("paycrestValidator deployed to:", paycrestValidator.address)
  return paycrestValidator;
}

async function main() {
  // const [deployer, aggregator, feeRecipient] = await ethers.getSigners();

  // const feeRecipientAddress = new ethers.Wallet(
  //   FEE_RECIPIENT_PRIVATE_KEY ?? feeRecipient
  // ).address;

  const { chainId } = await ethers.provider.getNetwork();
  const dirResolver = path.resolve(__dirname + `/deployment-${chainId}.json`);

  const protocolFeePercent = BigNumber.from(10_000);
  const primaryValidatorsFees = BigNumber.from(5_000); // 5%
  const secondaryValidatorsFees = BigNumber.from(3_000); // 3%
  const usdcMinimumStakeAmount = ethers.utils.parseUnits("500", 6); // not usdc has 6 decimals

  console.log(
    chainId.toString(),
    "======================================================= DEPLOYING PAYCREST ======================================================="
  );

  let USDC_ADDRESS;
  if (chainId.toString() === "97" || chainId.toString() === "80001") {
    const mockUSDC = await deployUSDC();
    // minting 1000000 USDC to deployer
    await mockUSDC.mint(
      ethers.utils.parseUnits("1000000", 6)
    );
    USDC_ADDRESS = mockUSDC.address;
  } else {
    USDC_ADDRESS = NETWORKS[chainId]["USDC_ADDRESS"];
  }
  console.log("USDC_ADDRESS is deployed to:", USDC_ADDRESS);

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

  await paycrest.updateFeeRecipient(fee, FEE_COLLECTOR_ADDRESS);
  await paycrest.updateFeeRecipient(aggregatorInit, AGGREGATOR_ADDRESS);
  await paycrest.updateFeeRecipient(stakeContract, paycrestValidator.address);

  console.log(
    "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  );

  const whitelist = ethers.utils.formatBytes32String("whitelist");
  await paycrest.settingManagerBool(whitelist, FEE_COLLECTOR_ADDRESS, true);

  await paycrestValidator.setMinimumAmountForTokens(
    USDC_ADDRESS,
    usdcMinimumStakeAmount
  );

  const network = {
    paycrestValidator: paycrestValidator.address,
    paycrest: paycrest.address,
    USDC: USDC_ADDRESS,
  };

  // fs.access(dirResolver, fs.F_OK, (err) => {
  //   if (err) {
  //     fs.writeFileSync(dirResolver, JSON.stringify(network, null, 4));
  //   }
  // });

  const fileName = `deployment-${chainId}.json`; // Create the desired file name

  const parentDir = path.resolve(__dirname, ".."); // Go up one level from the current directory
  const deploymentDir = path.join(parentDir, `deployment`); // Combine with 'deployment' folder name

  // Check if the deployment folder exists
  fs.access(deploymentDir, fs.constants.F_OK, (err) => {
    if (err) {
      // Folder doesn't exist, create it
      fs.mkdirSync(deploymentDir);

      // Now you can write the data to a file inside the deployment folder
      const filePath = path.join(deploymentDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(network, null, 4));
    } else {
      // Folder exists, you can still write the data to a file inside it
      const filePath = path.join(deploymentDir, fileName);
      fs.writeFileSync(filePath, JSON.stringify(network, null, 4));
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
