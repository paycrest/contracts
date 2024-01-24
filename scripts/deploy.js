// This script deals with deploying the Paycrest on a given network
const fs = require("fs");
const { ethers, upgrades, network } = require("hardhat");
const { confirmContinue, assertEnvironment } = require("./utils");

assertEnvironment();

async function deployPaycrest() {
  await confirmContinue({
    contract: "Paycrest",
    network: network.name,
    chainId: network.config.chainId,
  });

  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.deployProxy(Paycrest);;

  console.log(`Deploying Paycrest to ${paycrest.address}`);

  await paycrest.deployTransaction.wait(10);

  return paycrest;
}

async function main() {
  // Deploy Paycrest
  const paycrest = await deployPaycrest();

  console.log("✅ Deployed Paycrest.");

  const network = {
    paycrest: paycrest.address,
  };

  // fs.access(dirResolver, fs.F_OK, (err) => {
  //   if (err) {
  //     fs.writeFileSync(dirResolver, JSON.stringify(network, null, 4));
  //   }
  // });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
