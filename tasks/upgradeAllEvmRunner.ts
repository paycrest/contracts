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

/** settleIn-rebate Gateway implementations (see deployments/gateway-impl-settle-in-rebate.md). */
const SETTLE_IN_REBATE_IMPLS: Record<number, string> = {
	1: "0x18f209a96682662b58A7764e18a45d2413AEDE6A",
	56: "0xe606919d10031A44A4ac3108815512E87d938EbF",
	137: "0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21",
	42161: "0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21",
	8453: "0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21",
	42220: "0x18f209a96682662b58A7764e18a45d2413AEDE6A",
	1135: "0x18f209a96682662b58A7764e18a45d2413AEDE6A",
};

export default async function upgradeAllEvmTask(taskArgs: TaskArgs) {
	const privateKey =
		process.env.NEW_OWNER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("Set NEW_OWNER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
	}

	const networksFilter = taskArgs.networks?.trim() || undefined;
	const useExistingImpl = process.env.USE_EXISTING_IMPL === "1";

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
			impl: useExistingImpl
				? SETTLE_IN_REBATE_IMPLS[chainId] ?? "(deploy new)"
				: "(deploy new)",
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
		implementations: useExistingImpl ? SETTLE_IN_REBATE_IMPLS : undefined,
	});

	printUpgradeSummary(results, taskArgs.dryRun);

	const failed = results.some((r) => r.error && !r.skipped);
	if (failed && !taskArgs.dryRun) {
		throw new Error("One or more network upgrades failed");
	}
}
