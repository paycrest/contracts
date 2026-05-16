#!/usr/bin/env node
/**
 * TronScan verification helpers for Gateway on TRON.
 *
 * - status: uses the public TronScan API (GET /api/contract) to read verify_status — this is the
 *   supported "API" surface for verification *state*, not for submitting source (submission is UI + reCAPTCHA).
 * - prepare-proxy: resolves **TransparentUpgradeableProxy** verification inputs: pulls the **creation**
 *   transaction from TronScan and decodes the original constructor tuple (required after upgrades — the
 *   current EIP-1967 implementation is not what TronScan matches). Also prints current implementation via RPC.
 *
 * Usage:
 *   node scripts/tron/tronscan-verify-gateway.mjs status <TContractAddress>
 *   node scripts/tron/tronscan-verify-gateway.mjs prepare [mainnet|shasta] [TContractAddress]
 *   # If the first arg after prepare is a T-address, mainnet is assumed:
 *   node scripts/tron/tronscan-verify-gateway.mjs prepare TPANJTcjGJT72xzt5mnCpr8x4GerMWRrXF
 *   node scripts/tron/tronscan-verify-gateway.mjs prepare-proxy <TProxyAddress> [mainnet|shasta]
 *
 * Optional env (contracts/.env):
 *   TRONSCAN_API_KEY or TRON_PRO_API_KEY — sent as TRON-PRO-API-KEY (higher rate limits on apilist).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getImplementationAddress, getAdminAddress } from "@openzeppelin/upgrades-core";
import { AbiCoder, Interface, hexlify } from "ethers";
import tronwebMod from "tronweb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsRoot = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(contractsRoot, ".env") });

const TRONSCAN_API = "https://apilist.tronscanapi.com";

const TronWeb = tronwebMod.default || tronwebMod;

function rpcFullHost(net) {
  if (net === "shasta") {
    return process.env.TRON_FULL_HOST_SHASTA || "https://api.shasta.trongrid.io";
  }
  return process.env.TRON_FULL_HOST_MAINNET || "https://api.trongrid.io";
}

/** @param {InstanceType<typeof TronWeb>} tw */
function tronBase58ToEvm0x(tw, base58) {
  const h = tw.address.toHex(base58).replace(/^0x/i, "");
  return "0x" + h.slice(-40);
}

/** @param {InstanceType<typeof TronWeb>} tw */
function evm0xToTronBase58(tw, evmHex) {
  const h = evmHex.replace(/^0x/i, "").toLowerCase();
  return tw.address.fromHex("41" + h.slice(-40));
}

/**
 * @param {string} fullHost
 * @returns {{ send: (method: string, params: unknown[]) => Promise<unknown> }}
 */
function tronJsonRpcProvider(fullHost) {
  const key = process.env.TRONSCAN_API_KEY || process.env.TRON_PRO_API_KEY;
  const base = fullHost.replace(/\/$/, "");
  return {
    async send(method, params) {
      const post = async (withKey) => {
        const headers = { "Content-Type": "application/json" };
        if (withKey && key) {
          headers["TRON-PRO-API-KEY"] = key;
        }
        const res = await fetch(`${base}/jsonrpc`, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (res.status === 401 && withKey && key) {
          return null;
        }
        const j = await res.json();
        if (j.error) {
          throw new Error(j.error.message || JSON.stringify(j.error));
        }
        return j.result;
      };
      let r = await post(!!key);
      if (r === null) {
        r = await post(false);
      }
      return r;
    },
  };
}

function apiHeaders() {
  const key = process.env.TRONSCAN_API_KEY || process.env.TRON_PRO_API_KEY;
  /** @type {Record<string, string>} */
  const h = { Accept: "application/json" };
  if (key) {
    h["TRON-PRO-API-KEY"] = key;
  }
  return h;
}

/** @param {'mainnet' | 'shasta'} net */
function tronscanApiBase(net) {
  return net === "shasta" ? "https://shasta.apilist.tronscanapi.com" : TRONSCAN_API;
}

/**
 * Solidity appends CBOR metadata at the end of creation bytecode; last two bytes are its length (BE).
 * @param {Buffer} buf
 */
function stripSolcCborMetadata(buf) {
  if (buf.length < 4) {
    return buf;
  }
  const len = buf.readUInt16BE(buf.length - 2);
  if (len < 2 || len > buf.length - 2) {
    return buf;
  }
  const cut = buf.length - 2 - len;
  if (cut < 0) {
    return buf;
  }
  return buf.subarray(0, cut);
}

/**
 * Decode OpenZeppelin TransparentUpgradeableProxy constructor args from creation bytecode tail.
 * Matches the ProxyAdmin address from chain so variable-length `_data` still decodes correctly.
 * @param {Buffer} bytecode
 * @param {string} adminEvmLower `0x` + 40 hex lower
 */
function decodeTransparentProxyConstructorArgs(bytecode, adminEvmLower) {
  let buf = stripSolcCborMetadata(bytecode);
  const coder = AbiCoder.defaultAbiCoder();
  const admin = adminEvmLower.replace(/^0x/i, "").toLowerCase();
  for (let words = 5; words <= 32; words++) {
    const n = words * 32;
    if (buf.length < n) {
      break;
    }
    const tail = buf.subarray(buf.length - n);
    try {
      const [logic, admin_, data] = coder.decode(["address", "address", "bytes"], tail);
      if (admin_.replace(/^0x/i, "").toLowerCase() !== admin) {
        continue;
      }
      return {
        logic,
        admin_,
        data,
        encoded: "0x" + tail.toString("hex"),
      };
    } catch {
      /* try next size */
    }
  }
  return null;
}

/**
 * @param {string} proxyBase58
 * @param {'mainnet' | 'shasta'} net
 * @param {string} adminEvm `0x` + 40 hex
 * @returns {Promise<{ creationTxHash: string; creation: { logic: string; admin_: string; data: string; encoded: string } | null } | null>}
 */
async function fetchCreationConstructorArgsFromTronscan(proxyBase58, net, adminEvm) {
  const api = tronscanApiBase(net);
  const adminLower = adminEvm.toLowerCase();
  const contractUrl = `${api}/api/contract?contract=${encodeURIComponent(proxyBase58)}`;
  const headers = apiHeaders();
  let res = await fetch(contractUrl, { headers });
  if (res.status === 401 && headers["TRON-PRO-API-KEY"]) {
    res = await fetch(contractUrl, { headers: { Accept: "application/json" } });
  }
  if (!res.ok) {
    return null;
  }
  const cj = await res.json();
  const row = Array.isArray(cj.data) ? cj.data[0] : cj.data;
  const creationTxHash = row?.creator?.txHash;
  if (!creationTxHash) {
    return null;
  }
  const txUrl = `${api}/api/transaction-info?hash=${encodeURIComponent(creationTxHash)}`;
  let txRes = await fetch(txUrl, { headers });
  if (txRes.status === 401 && headers["TRON-PRO-API-KEY"]) {
    txRes = await fetch(txUrl, { headers: { Accept: "application/json" } });
  }
  if (!txRes.ok) {
    return null;
  }
  const tj = await txRes.json();
  let hex = tj.contractData?.new_contract?.bytecode;
  if (!hex || typeof hex !== "string") {
    return null;
  }
  hex = hex.replace(/^0x/i, "");
  const bytecode = Buffer.from(hex, "hex");
  const creation = decodeTransparentProxyConstructorArgs(bytecode, adminLower);
  if (!creation) {
    return { creationTxHash: creationTxHash, creation: null };
  }
  return { creationTxHash: creationTxHash, creation };
}

/** @param {string} contractBase58 */
async function cmdStatus(contractBase58) {
  if (!contractBase58 || !contractBase58.startsWith("T")) {
    console.error("Usage: node scripts/tron/tronscan-verify-gateway.mjs status <TContractAddress>");
    process.exit(1);
  }
  const url = `${TRONSCAN_API}/api/contract?contract=${encodeURIComponent(contractBase58)}`;
  const withKey = apiHeaders();
  let res = await fetch(url, { headers: withKey });
  // Invalid TRON-PRO-API-KEY often yields 401; retry without key (public tier).
  if (res.status === 401 && withKey["TRON-PRO-API-KEY"]) {
    console.warn(
      "TronScan returned 401 with TRON-PRO-API-KEY; retrying without API key. Fix or remove TRON_PRO_API_KEY / TRONSCAN_API_KEY in contracts/.env if you want the key to work."
    );
    res = await fetch(url, { headers: { Accept: "application/json" } });
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} from TronScan API`);
    process.exit(1);
  }
  const body = await res.json();
  const row = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!row || !row.address) {
    console.error("Unexpected response:", JSON.stringify(body).slice(0, 500));
    process.exit(1);
  }

  const vs = row.verify_status;
  const verifyLabel =
    vs === 2 || vs === true
      ? "verified (source published)"
      : vs === 1
        ? "pending / partial (check TronScan UI)"
        : vs === 0 || vs == null
          ? "not verified"
          : `unknown code (${vs})`;

  console.log("Contract:", row.address);
  console.log("TronScan name:", row.name || "(n/a)");
  console.log("verify_status:", vs, "→", verifyLabel);
  console.log("is_proxy:", row.is_proxy);
  if (row.proxy_implementation) {
    console.log("proxy_implementation:", row.proxy_implementation);
  }
  const nm = String(row.name || "");
  if (!row.is_proxy && /proxy/i.test(nm)) {
    console.log(
      "(TronScan `is_proxy` is often false for OpenZeppelin TransparentUpgradeableProxy; it does not mean this is not a proxy. Use `prepare-proxy` + EIP-1967 for upgradeable layout.)"
    );
  }
  console.log("\nAPI:", url);
  console.log("(verify_status meanings are inferred from public responses; TronScan UI is authoritative.)");
}

/**
 * @param {'mainnet' | 'shasta'} net
 * @param {string | undefined} contractBase58
 */
async function cmdPrepare(net, contractBase58) {
  const verifyUrl =
    net === "shasta"
      ? "https://shasta.tronscan.org/#/contracts/verify"
      : "https://tronscan.org/#/contracts/verify";

  const flatPath = path.join(contractsRoot, "flattened", "Gateway.sol");
  if (!fs.existsSync(flatPath)) {
    console.error("Missing", flatPath);
    console.error("Generate it with Hardhat flatten when available, or merge sources per TronScan flattening guide.");
    process.exit(1);
  }

  console.log("--- TronScan contract verification (UI) ---\n");
  console.log("Open:", verifyUrl);
  console.log("Select network in the TronScan header if needed (Mainnet vs Shasta).\n");
  console.log("Typical fields for Gateway *implementation* (upgradeable logic contract):\n");
  if (contractBase58) {
    console.log("  Contract address: ", contractBase58);
  } else {
    console.log("  Contract address:  <your implementation base58, e.g. from migration 2 deploy output>");
  }
  console.log("  Contract name:     Gateway");
  console.log("  Compiler:          0.8.18  (must match TronBox deploy — see tron-deploy/tronbox.js)");
  console.log("  License:           match Gateway.sol (UNLICENSED) or TronScan equivalent");
  console.log("  Optimization:      try **No** first (TronBox config does not enable the optimizer); if TronScan rejects, try **Yes** with **200** runs.");
  console.log("  Runs:              200 (only if optimization is enabled)\n");

  if (contractBase58) {
    const codeUrl = `${TRONSCAN_API}/api/contracts/code?contract=${encodeURIComponent(contractBase58)}`;
    let res = await fetch(codeUrl, { headers: apiHeaders() });
    if (res.status === 401 && apiHeaders()["TRON-PRO-API-KEY"]) {
      res = await fetch(codeUrl, { headers: { Accept: "application/json" } });
    }
    let chainHex = "";
    if (res.ok) {
      const payload = await res.json();
      const bc = payload.data?.byteCode;
      if (bc) {
        chainHex = String(bc).replace(/^0x/i, "").toLowerCase();
      }
    }
    const artPath = path.join(contractsRoot, "tron-deploy", "build", "contracts", "Gateway.json");
    let localHex = "";
    if (fs.existsSync(artPath)) {
      const g = JSON.parse(fs.readFileSync(artPath, "utf8"));
      localHex = String(g.deployedBytecode || "").replace(/^0x/i, "").toLowerCase();
    }
    if (chainHex && localHex) {
      const match = chainHex === localHex;
      console.log("--- Bytecode check (on-chain vs this repo’s `tron-deploy/build/contracts/Gateway.json`) ---");
      console.log("  On-chain length (hex chars):", chainHex.length);
      console.log("  Local artifact length:      ", localHex.length);
      console.log("  Exact match:               ", match ? "yes — flattened + settings below should verify." : "no — re-run `cd tron-deploy && tronbox compile` on the same commit as deploy, or adjust compiler/optimizer on TronScan until bytecode matches.");
      console.log("");
    }
  }

  console.log("Flattened single-file source (paste or upload on TronScan):\n");
  console.log(" ", flatPath);
  console.log(
    "\n⚠ TronScan compares pasted source to **on-chain** bytecode. If this repo’s TronBox build does not match your deploy machine, use the **standard JSON / sources from the machine that deployed** that address.\n"
  );
  console.log(
    "After submitting, poll status:\n  npm run tron:verify:status -- <TContractAddress>\n  # or: node scripts/tron/tronscan-verify-gateway.mjs status <TContractAddress>"
  );
}

/**
 * @param {string} proxyBase58
 * @param {'mainnet' | 'shasta'} net
 */
async function cmdPrepareProxy(proxyBase58, net) {
  if (!proxyBase58 || !proxyBase58.startsWith("T")) {
    console.error("Usage: node scripts/tron/tronscan-verify-gateway.mjs prepare-proxy <TProxyAddress> [mainnet|shasta]");
    process.exit(1);
  }

  const verifyUrl =
    net === "shasta"
      ? "https://shasta.tronscan.org/#/contracts/verify"
      : "https://tronscan.org/#/contracts/verify";

  const fullHost = rpcFullHost(net);
  const tw = new TronWeb({ fullHost });
  const provider = tronJsonRpcProvider(fullHost);
  const proxyEvm = tronBase58ToEvm0x(tw, proxyBase58);

  const implEvm = await getImplementationAddress(provider, proxyEvm);
  const adminEvm = await getAdminAddress(provider, proxyEvm);
  const implTron = evm0xToTronBase58(tw, implEvm);
  const adminTron = evm0xToTronBase58(tw, adminEvm);

  const creationBundle = await fetchCreationConstructorArgsFromTronscan(proxyBase58, net, adminEvm);

  const iface = new Interface(["function initialize()"]);
  const defaultInit = iface.encodeFunctionData("initialize", []);
  const initFromCreation = creationBundle?.creation?.data != null ? hexlify(creationBundle.creation.data) : defaultInit;

  let verifyEncoded = "";
  let verifyFallback = false;
  if (creationBundle?.creation) {
    verifyEncoded = creationBundle.creation.encoded;
  } else {
    verifyEncoded = AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes"],
      [implEvm, adminEvm, defaultInit]
    );
    verifyFallback = true;
  }

  const creationLogicTron = creationBundle?.creation
    ? evm0xToTronBase58(tw, creationBundle.creation.logic)
    : null;
  const upgraded =
    creationBundle?.creation &&
    creationBundle.creation.logic.toLowerCase() !== implEvm.toLowerCase();

  const ozProxySol = path.join(
    contractsRoot,
    "node_modules",
    "@openzeppelin",
    "contracts",
    "proxy",
    "transparent",
    "TransparentUpgradeableProxy.sol"
  );

  console.log("--- TronScan: verify TransparentUpgradeableProxy (Gateway proxy) ---\n");
  console.log("Open:", verifyUrl);
  console.log("Contract address (proxy):", proxyBase58);
  console.log("Contract name:            TransparentUpgradeableProxy");
  console.log("Compiler:                 **0.8.18** (exact), matching `tron-deploy/tronbox.js` `compilers.solc.version`.");
  console.log("License:                  MIT (OpenZeppelin file header) unless TronScan asks otherwise.");
  console.log("Optimization:             **No** / disabled (TronBox config does not enable the optimizer for this build).");
  console.log("Runs:                     **200** only matters if optimization is on; if the form still asks, use 200.");
  console.log("");
  console.log("--- If TronScan says verification failed ---");
  console.log("1) Constructor args must be the **creation** tuple printed below (not the current EIP-1967 implementation if you upgraded).");
  console.log("2) Single-file flatten: first line after SPDX must be `pragma solidity 0.8.18;` — not merged `^0.8.0 ^0.8.1 …` (see `flattened/TransparentUpgradeableProxy.sol` in this repo).");
  console.log("3) Try **multi-file** verify: upload `node_modules/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol` + its imports, same compiler/optimizer.");
  console.log("4) Paste constructor with **or without** leading `0x` depending on what the form expects.");
  console.log("");
  if (creationBundle?.creationTxHash) {
    const explorer =
      net === "shasta"
        ? `https://shasta.tronscan.org/#/transaction/${creationBundle.creationTxHash}`
        : `https://tronscan.org/#/transaction/${creationBundle.creationTxHash}`;
    console.log("--- TronScan verification: constructor args (must match **creation** tx) ---");
    console.log("Creation tx:", explorer);
    if (creationBundle.creation) {
      console.log(
        "Original _logic (at deploy):",
        creationLogicTron,
        `(${creationBundle.creation.logic.toLowerCase()})`
      );
      console.log("ProxyAdmin (admin_):          ", adminTron, `(${adminEvm})`);
      console.log("Init calldata (_data):       ", initFromCreation);
      if (upgraded) {
        console.log(
          "\nNote: EIP-1967 implementation was upgraded; the **current** implementation is below. TronScan still needs the **original** _logic above."
        );
      }
    } else {
      console.warn(
        "Could not decode constructor tuple from creation bytecode (unusual layout). Open the creation tx and copy constructor args from TronScan, or flatten the exact proxy artifact from the deploy commit."
      );
    }
  } else {
    console.warn(
      "Could not load creation tx from TronScan API; using on-chain EIP-1967 addresses for the encoded tuple below. If this proxy was upgraded, that tuple may be **wrong** for verification — check the contract creation transaction on TronScan."
    );
    verifyFallback = true;
  }
  if (verifyFallback) {
    console.warn(
      "\n⚠ Fallback encoding uses **current** implementation + default `initialize()` calldata — only correct if there was no upgrade and init matches."
    );
  }
  console.log("");
  console.log("--- Current chain (EIP-1967) ---");
  console.log("Implementation (now): ", implTron, `(${implEvm})`);
  console.log("ProxyAdmin (admin):   ", adminTron, `(${adminEvm})`);
  console.log("");
  console.log("Constructor arguments (ABI-encoded tuple — paste on TronScan):");
  console.log(verifyEncoded);
  console.log("");
  console.log("Without leading 0x (some forms want this):");
  console.log(verifyEncoded.replace(/^0x/i, ""));
  console.log("");
  console.log("OpenZeppelin proxy source (multi-file or flatten all imports):");
  console.log(" ", ozProxySol);
  console.log(
    "\nAlso verify the **implementation** at the EIP-1967 implementation address (contract name Gateway) if you want readable Gateway.sol on that address."
  );
  console.log(
    "\nPoll proxy verification:\n  npm run tron:verify:status -- " + proxyBase58
  );
}

const mode = process.argv[2];
const arg = process.argv[3];
const arg2 = process.argv[4];

if (mode === "status") {
  await cmdStatus(arg);
} else if (mode === "prepare") {
  let net = "mainnet";
  let contractAddr;
  if (arg && arg.startsWith("T")) {
    contractAddr = arg;
  } else {
    net = arg === "shasta" ? "shasta" : "mainnet";
    contractAddr = arg2 && arg2.startsWith("T") ? arg2 : undefined;
  }
  await cmdPrepare(net, contractAddr);
} else if (mode === "prepare-proxy") {
  const proxyAddr = arg && arg.startsWith("T") ? arg : null;
  const net = arg2 === "shasta" ? "shasta" : "mainnet";
  if (!proxyAddr) {
    console.error("Usage: node scripts/tron/tronscan-verify-gateway.mjs prepare-proxy <TProxyAddress> [mainnet|shasta]");
    process.exit(1);
  }
  await cmdPrepareProxy(proxyAddr, net);
} else {
  console.error(`Usage:
  node scripts/tron/tronscan-verify-gateway.mjs status <TContractAddress>
  node scripts/tron/tronscan-verify-gateway.mjs prepare [mainnet|shasta] [TContractAddress]
  node scripts/tron/tronscan-verify-gateway.mjs prepare <TContractAddress>
  node scripts/tron/tronscan-verify-gateway.mjs prepare-proxy <TProxyAddress> [mainnet|shasta]`);
  process.exit(1);
}
