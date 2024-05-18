const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const TransparentUpgradeableProxy = artifacts.require(
  "@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json"
); // for upgrade purpose
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
    console.error("Transparent: deploy box error", error);
  }
};
