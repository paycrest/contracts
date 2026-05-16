import { encodeBytes32String } from "ethers";
import { assertTronEnvironment, getTronContracts, getTronGatewayProtocolAddresses } from "../utils";
import dotenv from "dotenv";

dotenv.config();

assertTronEnvironment();

async function main() {
	let { gatewayInstance } = await getTronContracts();
	const onChain = await getTronGatewayProtocolAddresses(gatewayInstance);
	gatewayInstance = onChain.gatewayInstance;

	const envTreasury = process.env.TREASURY_ADDRESS_TRON!.trim();
	const envAggregator = process.env.AGGREGATOR_ADDRESS_TRON!.trim();

	console.log("On-chain treasury:   ", onChain.treasury || "(unknown — upgrade Gateway impl for `getTreasury`, or not set)");
	console.log("On-chain aggregator:", onChain.aggregator || "(zero / unset)");

	const treasuryKey = encodeBytes32String("treasury");
	const aggregatorKey = encodeBytes32String("aggregator");

	const sendOpts = { feeLimit: 100_000_000, tokenValue: 0 };

	if (onChain.treasury !== "" && onChain.treasury === envTreasury) {
		console.log(`⏭ Skip treasury update (${envTreasury}): already set`);
	} else {
		const hash = await gatewayInstance.updateProtocolAddress(treasuryKey, envTreasury).send(sendOpts);
		console.log(`✅ Update treasury address: ${hash}`);
	}

	if (onChain.aggregator === envAggregator) {
		console.log(`⏭ Skip aggregator update (${envAggregator}): already set`);
	} else {
		const hash = await gatewayInstance.updateProtocolAddress(aggregatorKey, envAggregator).send(sendOpts);
		console.log(`✅ Update aggregator address: ${hash}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
