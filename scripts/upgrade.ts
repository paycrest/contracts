import { ethers, upgrades, network } from "hardhat";
import { NETWORKS } from "./config";

const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];

async function main() {
  const proxyContractAddress = networkConfig.PAYCREST_CONTRACT;
  const factory = await ethers.getContractFactory("Paycrest");
  const contract = await upgrades.upgradeProxy(
    proxyContractAddress,
    factory
  );

  console.log("✅ Upgraded Paycrest: ", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});