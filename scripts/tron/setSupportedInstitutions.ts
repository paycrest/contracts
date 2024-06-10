// import { BigNumber } from "@ethersproject/bignumber";
import { getTronContracts } from "../utils";
import { CURRENCIES, INSTITUTIONS, NETWORKS } from "../config";
import { ethers } from "ethers";
import sdk from "@api/tron";

async function main() {
	const { gatewayInstance, gatewayContractAddress, tronWeb } =
		await getTronContracts();

	Object.entries(INSTITUTIONS).forEach(async ([key, institutions], index) => {
		const currency = CURRENCIES.find(
			(currency) => currency.code === ethers.utils.formatBytes32String(key)
		);
		if (!currency) {
			console.log(`❌ Currency not found for key: ${key}`);
			return;
		}

		const currencyCode = currency.code;
		const formattedInstitutions = institutions.map((inst) => [
			inst.code,
			inst.name,
		]);
		try {

			const tx = await gatewayInstance
				.setSupportedInstitutions(currencyCode, formattedInstitutions)
				.send({
					// feeLimit: ethers.utils.parseUnits("1000", 8).toString(),
					tokenValue: 0,
					shouldPollResponse: true,
				});

			console.log(
				`✅ Supported institutions set for currency ${ethers.utils.parseBytes32String(
					currencyCode
				)}: ${tx}`
			);
		} catch (e) {
			console.log(
				`❌ Error setting supported institutions for currency ${ethers.utils.parseBytes32String(
					currencyCode
				)}: ${e}`
			);
		}
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
