import { HardhatRuntimeEnvironment } from "hardhat/types/hre";

interface AccountTaskArguments {
  // No argument in this case
}

export default async function (
  taskArguments: AccountTaskArguments,
  hre: HardhatRuntimeEnvironment,
) {
  const accounts = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  for (const account of accounts) {
      console.log(
          "%s (%i ETH)",
          account.address,
          // hre.ethers.utils.formatEther(
              // getBalance returns wei amount, format to ETH amount
              await provider.getBalance(account.address)
          // )
      );
  }
}