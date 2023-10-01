const { NETWORKS } = require("../scripts/config.js");
const chainId = 42161;
module.exports = async () => {
  const { getNamedAccounts, deployments } = require("hardhat");
  const { deploy, get, save } = deployments;
  const { deployer } = await getNamedAccounts();

  const paycrestContractInstance = await get("Paycrest");
  const paycrestContract = await ethers.getContractAt(
    "Paycrest",
    paycrestContractInstance.address
  );

  const proxyDeployment = await deploy("PaycrestValidator", {
    contract: "PaycrestValidator",
    from: deployer,
    log: true,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [paycrestContract.address],
        },
      },
    },
  });
  await save("PaycrestValidator", {
    ...proxyDeployment,
    abi: proxyDeployment.abi,
  });

};
module.exports.dependencies = ["paycrest"];
module.exports.tags = ["basic", "PaycrestValidator"];
