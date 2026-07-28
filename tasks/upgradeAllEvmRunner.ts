import {
	upgradeAllEvmNetworks,
	printUpgradeSummary,
	resolveTargetChainIds,
	CHAIN_NAMES,
} from "../scripts/gatewayUpgradeCore.js";
import readline from "readline";

async function waitForInput(query: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(query, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

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
		throw new Error("Set DEPLOYER_PRIVATE_KEY");
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

	if (!taskArgs.dryRun && !taskArgs.yes) {
		const response = await waitForInput("\nProceed with upgrade on all listed networks? y/N\n");
		if (response !== "y") {
			console.log("Aborted.");
			return;
		}
	}

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
