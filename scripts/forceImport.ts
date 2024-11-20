// Import necessary libraries
import { ethers, upgrades } from "hardhat";

async function main() {
  // Define the address of the existing implementation contract
  const existingContractAddress: string =
		"0x5E7eC39915F6CD48829d06648F6682765846602a";

  // Define the implementation contract factory
  const deployedImplementation = await ethers.getContractFactory("Gateway");

  // Optionally, specify the kind of proxy
  const opts = {
    kind: 'uups' as const, // or 'transparent', 'beacon'
  };

  // Forcefully import the existing contract
  const importedContract = await upgrades.forceImport(
    existingContractAddress,
    deployedImplementation,
    opts
  );

  console.log("Contract successfully imported at address:", importedContract.address);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit;
  });