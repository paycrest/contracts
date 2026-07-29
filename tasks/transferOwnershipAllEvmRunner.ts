import {
	transferOwnershipAllEvm,
	printOwnershipSummary,
	OWNERSHIP_CHAIN_IDS,
} from "../scripts/transferOwnershipAllEvm.js";
import { NETWORKS } from "../scripts/config.js";
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
	yes: boolean;
	failFast: boolean;
	gatewayOnly: boolean;
	proxyAdminOnly: boolean;
	sequential: boolean;
	networks: string;
	newOwner: string;
};

export default async function transferOwnershipAllEvmTask(taskArgs: TaskArgs) {
	const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("Set DEPLOYER_PRIVATE_KEY");
	}

	const newOwner = (taskArgs.newOwner || process.env.NEW_OWNER || "").trim();
	if (!newOwner) {
		throw new Error("Pass --new-owner 0x... or set NEW_OWNER");
	}

	const newOwnerPrivateKey = process.env.NEW_OWNER_PRIVATE_KEY?.trim();
	if (!taskArgs.dryRun && !taskArgs.proxyAdminOnly && !newOwnerPrivateKey) {
		throw new Error(
			"Set NEW_OWNER_PRIVATE_KEY so acceptOwnership can run immediately after transferOwnership",
		);
	}

	const fundPrivateKey = process.env.FUND_ACCOUNT?.trim();

	if (taskArgs.gatewayOnly && taskArgs.proxyAdminOnly) {
		throw new Error("Use only one of --gateway-only / --proxy-admin-only");
	}

	const transferGateway = !taskArgs.proxyAdminOnly;
	const transferProxyAdmin = !taskArgs.gatewayOnly;

	const networksFilter = taskArgs.networks?.trim() || undefined;
	const listed = OWNERSHIP_CHAIN_IDS.filter((chainId) => {
		const cfg = NETWORKS[chainId as keyof typeof NETWORKS];
		return Boolean(cfg?.gatewayContract?.startsWith("0x"));
	});

	console.log("\nGateway + ProxyAdmin ownership transfer (EVM)");
	console.table({
		newOwner,
		mode: taskArgs.dryRun ? "dry-run" : "fund(if needed)+transfer+accept",
		transferGateway,
		transferProxyAdmin,
		acceptWithNewOwnerKey: Boolean(newOwnerPrivateKey),
		fundAccount: Boolean(fundPrivateKey),
		parallel: !taskArgs.sequential,
		networks: networksFilter || listed.join(","),
	});

	if (!taskArgs.dryRun && !taskArgs.yes) {
		const response = await waitForInput(
			"\nProceed with fund + ownership transfer + accept (parallel)? y/N\n",
		);
		if (response !== "y") {
			console.log("Aborted.");
			return;
		}
	}

	const results = await transferOwnershipAllEvm({
		privateKey,
		newOwner,
		newOwnerPrivateKey,
		fundPrivateKey,
		networks: networksFilter,
		dryRun: taskArgs.dryRun,
		transferGateway,
		transferProxyAdmin,
		parallel: !taskArgs.sequential,
	});

	printOwnershipSummary(results, taskArgs.dryRun);

	const failed = results.some((r) => r.error && !r.skipped);
	if (failed && !taskArgs.dryRun) {
		throw new Error("One or more ownership transfers failed");
	}
}
