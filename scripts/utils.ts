import readline from "readline";
import dotenv from "dotenv";
import { artifacts, network } from "hardhat";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { NETWORKS } from "./config";
import { promises as fs } from 'fs';
import * as path from "path";
import tronwebPkg from "tronweb";

const TronWeb = (tronwebPkg as { default?: typeof tronwebPkg }).default ?? tronwebPkg;

dotenv.config();

/** Placeholder chain ids in `NETWORKS`: Tron mainnet vs Shasta (see `scripts/config.ts`). */
export type TronScriptChainId = 12001 | 12002;

/**
 * Which TRON deployment scripts target. Set `TRON_SCRIPT_NETWORK=mainnet` for production Gateway
 * (`NETWORKS[12001]`); omit or use `shasta` for `NETWORKS[12002]` (default, backward compatible).
 */
export function getTronScriptChainId(): TronScriptChainId {
	const v = (process.env.TRON_SCRIPT_NETWORK || "").trim().toLowerCase();
	if (v === "shasta") {
		return 12002;
	}
	return 12001;
}

export function getTronNetworkConfig() {
	return NETWORKS[getTronScriptChainId()];
}

/** After TronGrid returns 401 ApiKey not exists, skip sending the header and rebuild TronWeb. */
let tronGridApiKeySuppressed = false;

function tronProApiKeyHeaders(): Record<string, string> {
	if (tronGridApiKeySuppressed) {
		return {};
	}
	const raw = process.env.TRON_PRO_API_KEY?.trim();
	if (!raw) {
		return {};
	}
	const key = raw.split("#")[0].trim();
	if (!key) {
		return {};
	}
	return { "TRON-PRO-API-KEY": key };
}

export function suppressTronGridApiKeyAndResetTronWeb() {
	tronGridApiKeySuppressed = true;
	tronWebSingleton = null;
	tronWebCacheKey = "";
	console.warn(
		"TronGrid rejected TRON-PRO-API-KEY (401 / ApiKey not exists). Retrying without API key. " +
			"Create a key at https://www.trongrid.io/ and set TRON_PRO_API_KEY in contracts/.env for higher limits."
	);
}

/** True when TronGrid rejects the configured API key (wrong key or TronScan key used by mistake). */
export function isTronGridApiKeyRejected(err: unknown): boolean {
	const e = err as {
		response?: { status?: number; data?: { Error?: string } };
		message?: string;
	};
	if (e?.response?.status !== 401) {
		return false;
	}
	const msg = e.response?.data?.Error ?? "";
	return typeof msg === "string" && /apikey|api key/i.test(msg);
}

function tronFullHostForScript(): string {
	const cfg = getTronNetworkConfig();
	const id = getTronScriptChainId();
	if (id === 12001) {
		return process.env.TRON_FULL_HOST_MAINNET || cfg.rpcUrl;
	}
	return process.env.TRON_FULL_HOST_SHASTA || cfg.rpcUrl;
}

let tronWebSingleton: InstanceType<typeof TronWeb> | null = null;
let tronWebCacheKey = "";

/** TronWeb instance for the current `TRON_SCRIPT_NETWORK` and RPC env. */
export function getTronWeb(): InstanceType<typeof TronWeb> {
	const fullHost = tronFullHostForScript();
	const pk = process.env.DEPLOYER_PRIVATE_KEY_TRON || "";
	const hdr = tronProApiKeyHeaders();
	const cacheKey = `${getTronScriptChainId()}:${fullHost}:${pk}:${hdr["TRON-PRO-API-KEY"] ? "hk" : "nohk"}`;
	if (!tronWebSingleton || tronWebCacheKey !== cacheKey) {
		tronWebSingleton = new TronWeb({
			fullHost,
			headers: tronProApiKeyHeaders(),
			privateKey: pk,
		});
		tronWebCacheKey = cacheKey;
	}
	return tronWebSingleton;
}

/**
 * Asserts that environment variables are set as expected
 */
export const assertEnvironment = () => {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    console.error("Please set DEPLOYER_PRIVATE_KEY in a .env file");
    process.exit(1); // Kill the process if DEPLOYER_PRIVATE_KEY is not set
  }
  if (!process.env.TREASURY_ADDRESS) {
    console.error("Please set TREASURY_ADDRESS in a .env file");
    process.exit(1); // Kill the process if TREASURY_ADDRESS is not set
  }
  if (!process.env.AGGREGATOR_ADDRESS) {
    console.error("Please set AGGREGATOR_ADDRESS in a .env file");
    process.exit(1); // Kill the process if AGGREGATOR_ADDRESS is not set
  }
};

/**
 * Asserts that environment variables are set as expected for Tron Network
 */
export const assertTronEnvironment = () => {
  if (!process.env.DEPLOYER_PRIVATE_KEY_TRON) {
    console.error("Please set DEPLOYER_PRIVATE_KEY_TRON in a .env file");
    process.exit(1); // Kill the process if DEPLOYER_PRIVATE_KEY_TRON is not set
  }
  if (!process.env.TREASURY_ADDRESS_TRON) {
    console.error("Please set TREASURY_ADDRESS_TRON in a .env file");
    process.exit(1); // Kill the process if TREASURY_ADDRESS_TRON is not set
  }
  if (!process.env.AGGREGATOR_ADDRESS_TRON) {
    console.error("Please set AGGREGATOR_ADDRESS_TRON in a .env file");
    process.exit(1); // Kill the process if AGGREGATOR_ADDRESS_TRON is not set
  }
  if (!process.env.TRON_PRO_API_KEY?.trim()) {
    console.warn(
      "TRON_PRO_API_KEY is unset — TronGrid may rate-limit or reject some calls. Create a key at https://www.trongrid.io/ and set TRON_PRO_API_KEY in contracts/.env."
    );
  }
};

/**
 * Helper method for waiting on user input. Source: https://stackoverflow.com/a/50890409
 * @param query
 */
export async function waitForInput(query: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Helper method for confirming user input
 *
 * @param params
 */
export async function confirmContinue(params: any) {
  console.log("\nPARAMETERS");
  console.table(params);

  const response = await waitForInput("\nDo you want to continue? y/N\n");
  if (response !== "y")
    throw new Error("Aborting script: User chose to exit script");
  console.log("\n");
}


export async function updateConfigFile(chainId: number, implementationAddress: string): Promise<void> {
  try {
    const configFilePath = path.join(__dirname, 'config.ts');
    // Read the existing config file
    let configContent = await fs.readFile(configFilePath, 'utf-8');

    // Create a regex to match the network object for the specific chainId
    const networkRegex = new RegExp(`(${chainId}:\\s*{[\\s\\S]*?)(},?)`, 'g');

    if (networkRegex.test(configContent)) {
      configContent = configContent.replace(networkRegex, (match) => {
        const lines = match.split('\n');
        const updatedLines = lines.map(line => {
          if (line.trim().startsWith('GATEWAY_IMPLEMENTATION:')) {
            return line.replace(/IMPLEMENTATION:.*/, `GATEWAY_IMPLEMENTATION: "${implementationAddress}",`);
          }
          return line;
        });

        if (!updatedLines.some(line => line.trim().startsWith('GATEWAY_IMPLEMENTATION:'))) {
          // If IMPLEMENTATION doesn't exist, add it before the closing brace
          updatedLines.splice(-1, 0, `\t\GATEWAY_IMPLEMENTATION: "${implementationAddress}",`);
        }

        return updatedLines.join('\n');
      });
    } else {
      console.error(`Network configuration for chainId ${chainId} not found in config file.`);
      return;
    }

    // Write the updated content back to the file
    await fs.writeFile(configFilePath, configContent, 'utf-8');

    console.log(`Updated config.ts with chainId: ${chainId} and implementation address: ${implementationAddress}`);
  } catch (error) {
    console.error('Error updating config file:', error);
  }
}


/**
 * Retrieves the wallet and contract instances.
 * 
 * @returns An object containing the wallet and contract instances.
 */
export async function getContracts(): Promise<any> {
  assertEnvironment();

  const networkConfig = NETWORKS[network.config.chainId as keyof typeof NETWORKS];
  const Gateway = await artifacts.readArtifact("Gateway");

  // Get signer
  const provider = new JsonRpcProvider(networkConfig.rpcUrl);
  const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  // Get contract instances
  const gatewayInstance = new Contract(networkConfig.gatewayContract, Gateway.abi, provider);

  return {
		wallet,
		gatewayInstance,
		tronWeb: getTronWeb(),
	};
}

/**
 * Retrieves the contract instances for TRON Network.
 * 
 * @returns An object containing the contract instances.
 */
export async function getTronContracts(): Promise<any> {
  assertTronEnvironment();
  const Gateway = await artifacts.readArtifact("Gateway");
  const networkConfig = getTronNetworkConfig();
  const gatewayContractAddress = networkConfig.gatewayContract;
  const tw = getTronWeb();
  let gatewayInstance = await tw.contract(Gateway.abi, gatewayContractAddress);
  return {
		gatewayInstance,
		gatewayContractAddress,
	};
}

/** Normalize TronWeb view results: hex `41…` / `0x…` / bare 20-byte hex → base58 `T…` for `.env` comparison. */
function normalizeTronGatewayAddress(tw: InstanceType<typeof TronWeb>, addr: unknown): string {
	if (addr == null) {
		return "";
	}
	let s = String(addr).trim();
	if (!s) {
		return "";
	}
	if (s.startsWith("T") && s.length >= 34) {
		return s;
	}
	let h = s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
	h = h.toLowerCase();
	if (h.length === 40 && /^[0-9a-f]{40}$/.test(h)) {
		return tw.address.fromHex("41" + h);
	}
	if (h.length === 42 && h.startsWith("41") && /^[0-9a-f]+$/.test(h)) {
		return tw.address.fromHex(h);
	}
	return s;
}

/**
 * Reads `getTreasury()` and `getAggregator()` via TronWeb. Retries once without `TRON-PRO-API-KEY` on TronGrid 401.
 * Returns the possibly refreshed `gatewayInstance` after an API-key suppress + reconnect.
 * Addresses are normalized to **base58** (`T…`) so they match `TREASURY_ADDRESS_TRON` / `AGGREGATOR_ADDRESS_TRON`.
 */
export async function getTronGatewayProtocolAddresses(gatewayInstance: any): Promise<{
	treasury: string;
	aggregator: string;
	gatewayInstance: any;
}> {
	const tw = getTronWeb();
	const read = async (gwi: any) => {
		let treasury = "";
		try {
			treasury = normalizeTronGatewayAddress(tw, await gwi.getTreasury().call());
		} catch {
			// Older Gateway implementations without `getTreasury()` — cannot skip treasury tx safely.
		}
		const aggregator = normalizeTronGatewayAddress(tw, await gwi.getAggregator().call());
		return {
			treasury,
			aggregator,
			gatewayInstance: gwi,
		};
	};
	try {
		return await read(gatewayInstance);
	} catch (e) {
		if (isTronGridApiKeyRejected(e)) {
			suppressTronGridApiKeyAndResetTronWeb();
			const { gatewayInstance: gw2 } = await getTronContracts();
			return await read(gw2);
		}
		throw e;
	}
}