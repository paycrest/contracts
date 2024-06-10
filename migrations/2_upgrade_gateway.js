const TransparentUpgradeableProxy = artifacts.require(
	"@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json"
);
const Gateway = artifacts.require("Gateway");
const GatewayV2 = artifacts.require("GatewayV2");

module.exports = async function (deployer) {
    const GATEWAY_CONTRACT = "TDJwpCwrWq6q1fU5jWxTZVaCJA1HJ4owXZ";
    // const V2_IMPLEMENTATION = "TTHmFp2rKWQVsCQXWvqsQVj8nAqa9wo5x1";
	try {
		// Deploy the new GatewayV2 implementation contract
		const V2 = await deployer.deploy(GatewayV2);

		// Upgrade proxy contract
		const proxyContract = await TransparentUpgradeableProxy.at(
			GATEWAY_CONTRACT
		);
		await proxyContract.upgrade(V2.address);
		console.info("✅ Gateway Upgraded", GATEWAY_CONTRACT);

	} catch (error) {
		console.error("❌ Gateway: upgrade box error", error);
	}
};
