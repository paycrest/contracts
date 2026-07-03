const Gateway = artifacts.require("Gateway");

module.exports = async function (deployer) {
  await deployer.deploy(Gateway);
  console.info("✅ Deployed Gateway implementation only: ", Gateway.address);
};
