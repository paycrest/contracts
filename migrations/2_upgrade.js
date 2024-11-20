const { admin } = require('@openzeppelin/truffle-upgrades');
const ProxyAdmin = artifacts.require(
    '@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json'
  );
const Gateway = artifacts.require("Gateway");

const proxyContractAddress = "THyFP5ST9YyLZn6EzjKjFhZti6aKPgEXNU"; 
// Shasta: 
// const proxyContractAddress = "TYA8urq7nkN2yU7rJqAgwDShCusDZrrsxZ";

module.exports = async function (deployer) {
  try {
    // Deploy the new Gateway implementation contract
    await deployer.deploy(Gateway);

    // Upgrade proxy contract
    const adminIns = await admin.getInstance();
    const adminContract = await ProxyAdmin.at(adminIns.address);
    await adminContract.upgrade(proxyContractAddress, Gateway.address);
    console.info("✅ Upgraded Gateway: ", proxyContractAddress);
  } catch (error) {
    console.error("UUPS: upgrade contract error", error);
  }
};