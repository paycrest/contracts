import { formatEther } from "ethers";
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
    // getBalance returns a wei amount, format it to ETH for readability.
    const balance = await provider.getBalance(account.address);
    console.log("%s (%s ETH)", account.address, formatEther(balance));
  }
}
