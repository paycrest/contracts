// This script deals with deploying the Paycrest on a given network
const { ethers, network } = require("hardhat");
const { confirmContinue, assertEnvironment } = require("./utils");

assertEnvironment();

async function main() {
  // Wait 10 blocks for re-org protection
  const blocksToWait = network.name === "hardhat" ? 0 : 10;

  // Deploy Paycrest
  await confirmContinue({
    contract: "Paycrest",
    network: network.name,
    chainId: network.config.chainId,
  });

  const paycrest = await ethers.getContractFactory("Paycrest");
  const paycrestContract = await paycrest.deploy(network.config.USDC_ADDRESS);

  console.log(`Deploying Paycrest to ${paycrestContract.address}`);

  await paycrestContract.deployTransaction.wait(blocksToWait);

  console.log("✅ Deployed Paycrest.");

  // Deploy PaycrestValidator
  await confirmContinue({
    contract: "PaycrestValidator",
    network: network.name,
    chainId: network.config.chainId,
  });

  const paycrestValidator = await ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidatorContract = await paycrestValidator.deploy(
    paycrestContract.address
  );

  console.log(
    `Deploying PaycrestValidator to ${paycrestValidatorContract.address}`
  );

  await paycrestValidatorContract.deployTransaction.wait(blocksToWait);

  console.log("✅ Deployed PaycrestValidator.");

  return paycrestValidatorContract.address;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
