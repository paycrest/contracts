import { ethers, upgrades, network } from "hardhat";
import { confirmContinue, assertEnvironment } from "./utils";

assertEnvironment();

// Function declarations
async function deployPaycrest(): Promise<any> {
  await confirmContinue({
    contract: "Paycrest",
    network: network.name,
    chainId: network.config.chainId,
  });

  const factory = await ethers.getContractFactory("Paycrest");
  const contract = await upgrades.deployProxy(factory);

  console.log(`Deploying Paycrest to ${contract.address}`);

  const tx = await contract.deployTransaction.wait();

  console.log("✅ Deployed Paycrest: ", tx.transactionHash);

  return tx;
}

async function main() {
  // Deploy Paycrest
  await deployPaycrest();

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
