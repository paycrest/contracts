const { ethers, upgrades } = require("hardhat");

async function main() {

    const USDC_ADDRESS = "0xFda3cD366b8C554Ba2c409d7E810833BB3390946";

    const PaycrestV2 = await ethers.getContractFactory("PaycrestV2");
    const paycrestV2 = await upgrades.upgradeProxy(PaycrestV2, [USDC_ADDRESS]);
    console.log("paycrest upgrades to:", await paycrestV2.address);
    console.log("✅ upgrades Paycrest.");

    const PaycrestValidatorV2 = await ethers.getContractFactory(
      "PaycrestValidatorV2"
    );
    const paycrestValidatorV2 = await upgrades.upgradeProxy(PaycrestValidatorV2, [
      paycrest.address,
    ]);
    console.log(
      "paycrestValidator upgrades to:",
      await paycrestValidatorV2.address
    );
    console.log("✅ upgrades paycrestValidator.");
}

main();
