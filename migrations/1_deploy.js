const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const Gateway = artifacts.require("Gateway");

module.exports = async function (deployer) {
  try {
    deployer.trufflePlugin = true;
    const gatewayContractInstance = await deployProxy(Gateway, {
      deployer,
    });
    await Gateway.deployed();
    console.info("✅ Deployed Gateway: ", gatewayContractInstance.address);
  } catch (error) {
    console.error("Transparent: deploy contract error", error);
  }
};
