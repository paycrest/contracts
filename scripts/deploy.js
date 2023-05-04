// This script deals with deploying the Paycrest on a given network
const { ethers, network } = require("hardhat");
const { confirmContinue, assertEnvironment } = require("./utils");

assertEnvironment();

async function deployPaycrest(USDC_ADDRESS) {
  await confirmContinue({
    contract: "Paycrest",
    network: network.name,
    chainId: network.config.chainId,
  });

  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await Paycrest.deploy(USDC_ADDRESS);

  console.log(`Deploying Paycrest to ${paycrest.address}`);

  await paycrest.deployTransaction.wait(blocksToWait);

  return paycrest;
}

async function deployPaycrestValidator(paycrest) {
  await confirmContinue({
    contract: "PaycrestValidator",
    network: network.name,
    chainId: network.config.chainId,
  });

  const PaycrestValidator = await ethers.getContractFactory(
    "PaycrestValidator"
  );
  const paycrestValidator = await PaycrestValidator.deploy(paycrest.address);

  console.log(`Deploying PaycrestValidator to ${paycrestValidator.address}`);

  await paycrestValidator.deployTransaction.wait(blocksToWait);

  return paycrestValidator;
}

async function main() {
  // Wait 10 blocks for re-org protection
  const blocksToWait = network.name === "hardhat" ? 0 : 10;

  // Deploy Paycrest
  const paycrest = await deployPaycrest(network.config.USDC_ADDRESS);

  console.log("✅ Deployed Paycrest.");

  // Deploy PaycrestValidator
  const paycrestValidator = await deployPaycrestValidator(paycrest);

  console.log("✅ Deployed PaycrestValidator.");

  const network = {
    paycrest: paycrest.address,
    paycrestValidator: paycrestValidator.address,
  };

  fs.access(dirResolver, fs.F_OK, (err) => {
    if (err) {
      fs.writeFileSync(dirResolver, JSON.stringify(network, null, 4));
    }
  });

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
