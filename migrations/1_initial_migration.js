const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const TransparentUpgradeableProxy = artifacts.require(
  "@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json"
); // for upgrade purpose
const Gateway = artifacts.require("Gateway");

module.exports = async function (deployer) {
  try {
    // Setup tronbox deployer
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

// Upgrades

// const GatewayV2 = artifacts.require("GatewayV2");

// module.exports = async function (deployer) {
//   try {
//     // Deploy the new BoxV2 implementation contract
//     await deployer.deploy(GatewayV2);

//     // Upgrade proxy contract
//     const proxyContract = await TransparentUpgradeableProxy.at(
//       Gateway.address /* V1 address */
//     );
//     await proxyContract.upgradeTo(GatewayV2.address);
//     console.info("Upgraded", Gateway.address);

//     // Call proxy contract
//     const gatewayV2 = await GatewayV2.at(Gateway.address);
//     // contract call
//   } catch (error) {
//     console.error("UUPS: upgrade box error", error);
//   }
// };
