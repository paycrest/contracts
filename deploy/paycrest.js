const { NETWORKS } = require("../scripts/config.js");
const chainId = 42161;
module.exports = async () => {
  const { getNamedAccounts, deployments } = require("hardhat");
  const { deploy, get, save } = deployments;
  const { deployer } = await getNamedAccounts();

  const mockUSDCContractInstance = await get("MockUSDC");

  const proxyDeployment = await deploy("Paycrest", {
    contract: "Paycrest",
    from: deployer,
    log: true,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [mockUSDCContractInstance.address],
        },
      },
    },
  });
  await save("Paycrest", {
    ...proxyDeployment,
    abi: proxyDeployment.abi,
  });
};
module.exports.dependencies = ["MockUSDC"];
module.exports.tags = ["basic", "paycrest"];
