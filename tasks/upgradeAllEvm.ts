import dotenv from "dotenv";
import {
	upgradeAllEvmNetworks,
	printUpgradeSummary,
	resolveTargetChainIds,
	CHAIN_NAMES,
} from "../scripts/gatewayUpgradeCore.js";

dotenv.config();

type TaskArgs = {
	dryRun: boolean;
	setFees: boolean;
	updateConfig: boolean;
	yes: boolean;
	failFast: boolean;
	networks: string;
};

export default async function upgradeAllEvmTask(taskArgs: TaskArgs) {
	const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("Set DEPLOYER_PRIVATE_KEY in .env");
	}

	const networksFilter = taskArgs.networks?.trim() || undefined;

	const chainIds = resolveTargetChainIds({
		networks: networksFilter,
	});

	console.log("\nGateway batch upgrade (EVM)");
	console.table(
		chainIds.map((chainId) => ({
			network: CHAIN_NAMES[chainId] ?? chainId,
			chainId,
			mode: taskArgs.dryRun ? "dry-run" : "upgrade",
			setFees: taskArgs.setFees,
		})),
	);

	const results = await upgradeAllEvmNetworks({
		privateKey,
		networks: networksFilter,
		dryRun: taskArgs.dryRun,
		setFees: taskArgs.setFees,
		updateConfig: taskArgs.updateConfig,
		continueOnError: !taskArgs.failFast,
	});

	printUpgradeSummary(results, taskArgs.dryRun);

	const failed = results.some((r) => r.error && !r.skipped);
	if (failed && !taskArgs.dryRun) {
		throw new Error("One or more network upgrades failed");
	}
}
