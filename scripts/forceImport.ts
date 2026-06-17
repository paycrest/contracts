// Import necessary libraries
import { ethers } from "ethers";
import hre from "hardhat";
import Gateway from "../artifacts/contracts/Gateway.sol/Gateway.json";

const { upgrades } = hre as unknown as {
  upgrades: {
    forceImport: (
      address: string,
      factory: ethers.ContractFactory,
      opts: { kind: "uups" | "transparent" | "beacon" }
    ) => Promise<ethers.BaseContract>;
  };
};

async function main() {
  // Define the address of the existing implementation contract
  const existingContractAddress: string =
		"0xd28da2E11FCd2A9F44D5a4952430CE8b4f3Ee05f";

  // Define the implementation contract factory
  const deployedImplementation = new ethers.ContractFactory(Gateway.abi, Gateway.bytecode);

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

  console.log("Contract successfully imported at address:", await importedContract.getAddress());

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });