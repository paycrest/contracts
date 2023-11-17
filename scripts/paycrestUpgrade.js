const { ethers, upgrades } = require("hardhat");

async function main() {
  const { deployer } = await getNamedAccounts();
  const Paycrest = await ethers.getContractFactory("Paycrest");
  const paycrest = await upgrades.upgradeProxy(
    "0x3fE1246CbC4eDf2A4f51f7CF442277bA863823e1", //"0x643db3aa8adDFd1877453491d144aD184cf8261b",
    Paycrest
  );

  const DERC20_Token = "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1";

  console.log("✅ upgrades paycrest.", paycrest.address);

  const currency = ethers.utils.formatBytes32String("NGN");

  const firstBank = {
    code: ethers.utils.formatBytes32String("FBNINGLA"),
    name: ethers.utils.formatBytes32String("First Bank"),
  };
  const opay = {
    code: ethers.utils.formatBytes32String("OPAYNINGLA"),
    name: ethers.utils.formatBytes32String("Opay"),
  };
  const palmpay = {
    code: ethers.utils.formatBytes32String("PPBNINGLA"),
    name: ethers.utils.formatBytes32String("Palmpay Bank"),
  };
  const accessBank = {
    code: ethers.utils.formatBytes32String("ACBNINGLA"),
    name: ethers.utils.formatBytes32String("Access Bank"),
  };
  const gtb = {
    code: ethers.utils.formatBytes32String("GTBNINGLA"),
    name: ethers.utils.formatBytes32String("GTB"),
  };
  const stanbic = {
    code: ethers.utils.formatBytes32String("IBTCNINGLA"),
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

  const amount = ethers.utils.parseUnits("1", 15);
  const messageHash =
    "0xa3c6bfc43a5f2297001a72039b835698bae96310babf9ff34acc52ad530316f37b961cdf6b119f9422a424b9ad4ac949e282c276131fa7820535a01eb7703cd76350a190e1b6ee4ecc84f6a0f7d090b52e1f565319af139a557fab64b027427e1812576dbfd6c5a2e95166c9a0bc02e967a45be472259572e166758c7865cdc24255f200de23f84f1ac1cc8035b1";

  // await paycrest.createOrder(
  //   DERC20_Contract_Instance.address,
  //   amount,
  //   ethers.utils.formatBytes32String("FBNINGLA"),
  //   970,
  //   deployer,
  //   0,
  //   deployer,
  //   messageHash.toString()
  // );

  // verify contract
  run("verify:verify", {
    address: paycrest.address,
  });
}

main();
