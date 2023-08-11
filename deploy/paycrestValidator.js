const { NETWORKS } = require("../scripts/config.js");
const chainId = 42161;
module.exports = async () => {
  const { getNamedAccounts, deployments } = require("hardhat");
  const { deploy, get, save } = deployments;
  const { deployer } = await getNamedAccounts();

  const paycrestContractInstance = await get("Paycrest");
  const paycrestContract = await ethers.getContractAt(
    "Paycrest",
    paycrestContractInstance.address
  );

  const proxyDeployment = await deploy("PaycrestValidator", {
    contract: "PaycrestValidator",
    from: deployer,
    log: true,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [paycrestContract.address],
        },
      },
    },
  });
  await save("PaycrestValidator", {
    ...proxyDeployment,
    abi: proxyDeployment.abi,
  });

  // const protocolFeePercent = BigNumber.from(10_000);
  // const primaryValidatorsFees = BigNumber.from(5_000); // 5%
  // const secondaryValidatorsFees = BigNumber.from(3_000); // 3%
  // const usdcMinimumStakeAmount = ethers.utils.parseUnits("500", 6); // not usdc has 6 decimals

  // const currency = ethers.utils.formatBytes32String("NGN");

  // const firstBank = {
  //   code: ethers.utils.formatBytes32String("191"),
  //   name: ethers.utils.formatBytes32String("First Bank"),
  // };
  // const opay = {
  //   code: ethers.utils.formatBytes32String("192"),
  //   name: ethers.utils.formatBytes32String("Opay"),
  // };
  // const palmpay = {
  //   code: ethers.utils.formatBytes32String("193"),
  //   name: ethers.utils.formatBytes32String("Palmpay Bank"),
  // };
  // const accessBank = {
  //   code: ethers.utils.formatBytes32String("194"),
  //   name: ethers.utils.formatBytes32String("Access Bank"),
  // };
  // const gtb = {
  //   code: ethers.utils.formatBytes32String("195"),
  //   name: ethers.utils.formatBytes32String("GTB"),
  // };
  // const stanbic = {
  //   code: ethers.utils.formatBytes32String("196"),
  //   name: ethers.utils.formatBytes32String("Stanbic IBTC Bank"),
  // };

  // await paycrest.setSupportedInstitutions(currency, [
  //   firstBank,
  //   opay,
  //   palmpay,
  //   accessBank,
  //   gtb,
  //   stanbic,
  // ]);
  // console.log(
  //   "======================================================= SETTING MANAGER FOR PROTOCOL FEES RECIPIENTS ======================================================="
  // );

  // await paycrest.updateProtocolFees(
  //   protocolFeePercent,
  //   primaryValidatorsFees,
  //   secondaryValidatorsFees
  // );

  // console.log(
  //   "======================================================= SETTING MANAGER FOR PROTOCOL ADDRESSES ======================================================="
  // );
  // const fee = ethers.utils.formatBytes32String("fee");
  // const aggregatorInit = ethers.utils.formatBytes32String("aggregator");
  // const stakeContract = ethers.utils.formatBytes32String("stakeContract");

  // await paycrest.updateFeeRecipient(fee, feeRecipient.address);
  // await paycrest.updateFeeRecipient(aggregatorInit, aggregator.address);
  // await paycrest.updateFeeRecipient(stakeContract, paycrestValidator.address);

  // console.log(
  //   "======================================================= SETTING MANAGER FOR MINIMUM AND MAXIMUM ON PAYCREST VALIDATOR======================================================="
  // );

  // const whitelist = ethers.utils.formatBytes32String("whitelist");
  // await paycrest.settingManagerBool(whitelist, feeRecipient.address, true);

  // await paycrestValidator.setMinimumAmountForTokens(
  //   USDC_ADDRESS,
  //   usdcMinimumStakeAmount
  // );
};
module.exports.dependencies = ["paycrest"];
module.exports.tags = ["basic", "PaycrestValidator"];
