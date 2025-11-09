const { upgrades } = require("hardhat");
const hardhat = require("hardhat");
const { mockUSDTFixture } = require("./mockUSDT.js");
const { configureTokenFeeSettings } = require("../utils/utils.manager.js");

async function gateway() {
  const { mockUSDT } = await mockUSDTFixture();
  const gatewayFactory = await hardhat.ethers.getContractFactory("Gateway");
  const gateway = await upgrades.deployProxy(gatewayFactory);
  await gateway.deployed();

  console.log("Gateway deployed to:", gateway.address);

  // First, mark the token as supported
  const [deployer] = await hardhat.ethers.getSigners();
  const token = hardhat.ethers.utils.formatBytes32String("token");
  await gateway.connect(deployer).settingManagerBool(token, mockUSDT.address, hardhat.ethers.BigNumber.from(1));

  // Then configure token fee settings for mockUSDT
  await configureTokenFeeSettings(gateway, deployer, mockUSDT.address, {
    senderToProvider: 50000,      // 50% of sender fee goes to provider
    providerToAggregator: 50000, // 50% of provider's share goes to aggregator
    senderToAggregator: 0,       // 0% of sender fee goes to aggregator (FX mode)
    providerToAggregatorFx: 500  // 0.5% of transaction amount provider pays to aggregator (FX mode)
  });

  return { gateway, mockUSDT };
}

const gatewayFixture = hardhat.deployments.createFixture(gateway);

module.exports = {
  gatewayFixture
};

