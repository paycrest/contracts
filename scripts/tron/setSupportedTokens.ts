import { encodeBytes32String } from "ethers";
import {
	getTronContracts,
	getTronNetworkConfig,
	getTronScriptChainId,
	isTronGridApiKeyRejected,
	suppressTronGridApiKeyAndResetTronWeb,
} from "../utils";

async function main() {
	let { gatewayInstance } = await getTronContracts();
	const networkConfig = getTronNetworkConfig();
	const chainId = getTronScriptChainId();

	console.log(`TRON_SCRIPT_NETWORK → chain placeholder ${chainId}, gateway ${networkConfig.gatewayContract}`);

	const tokenKey = encodeBytes32String("token");

	const coerceBool = (v: unknown): boolean => {
		if (typeof v === "boolean") {
			return v;
		}
		if (typeof v === "number") {
			return v !== 0;
		}
		if (typeof v === "string") {
			return v === "true" || v === "1";
		}
		return Boolean(v);
	};

	for (const [key, token] of Object.entries(networkConfig.supportedTokens)) {
		try {
      console.log(`Setting supported token ${key} (${token.address})`);
			const raw = await gatewayInstance.isTokenSupported(token.address).call();
			if (coerceBool(raw)) {
				console.log(`⏭ Skip ${key} (${token.address}): already supported`);
				continue;
			}
		} catch (e) {
			if (isTronGridApiKeyRejected(e)) {
				suppressTronGridApiKeyAndResetTronWeb();
				({ gatewayInstance } = await getTronContracts());
				try {
					const raw = await gatewayInstance.isTokenSupported(token.address).call();
					if (coerceBool(raw)) {
						console.log(`⏭ Skip ${key} (${token.address}): already supported`);
						continue;
					}
				} catch (e2) {
					console.warn(`⚠ Could not read isTokenSupported for ${key}; will still try settingManagerBool:`, e2);
				}
			} else {
				console.warn(`⚠ Could not read isTokenSupported for ${key}; will still try settingManagerBool:`, e);
			}
		}

		const send = () =>
			gatewayInstance.settingManagerBool(tokenKey, token.address, 1).send({
				feeLimit: 100_000_000,
				tokenValue: 0,
				shouldPollResponse: true,
			});
		try {
			const tx = await send();
			console.log(`✅ Set token ${key}: ${tx}`);
		} catch (e) {
			if (isTronGridApiKeyRejected(e)) {
				suppressTronGridApiKeyAndResetTronWeb();
				({ gatewayInstance } = await getTronContracts());
				try {
					const tx = await send();
					console.log(`✅ Set token ${key}: ${tx}`);
				} catch (e2) {
					console.error(`❌ Error setting token ${key}:`, e2);
				}
			} else {
				console.error(`❌ Error setting token ${key}:`, e);
			}
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
