import { HardhatRuntimeEnvironment } from "hardhat/types/hre";

interface AccountTaskArguments {
  // No argument in this case
}

export default async function (
  _taskArguments: AccountTaskArguments,
  hre: HardhatRuntimeEnvironment,
) {
  const accounts = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  for (const account of accounts) {
    console.log(
      "%s (%i ETH)",
      account.address,
      // getBalance returns wei amount.
      await provider.getBalance(account.address)
    );
  }
}