const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const TronWeb = require("tronweb");
const { getAdminAddress, getImplementationAddress } = require("@openzeppelin/upgrades-core");
const { wrapProvider } = require("@openzeppelin/truffle-upgrades/dist/utils/wrap-provider.js");

const ProxyAdmin = artifacts.require(
  "@openzeppelin/upgrades-core/artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/ProxyAdmin.json"
);
const Gateway = artifacts.require("Gateway");

/**
 * Transparent proxy (user-facing Gateway) base58 — NOT the implementation
 * address printed as "Gateway:" after `deployer.deploy(Gateway)`.
 * Required so we never upgrade the wrong proxy by accident.
 */
const proxyContractAddress = process.env.GATEWAY_PROXY_TRON;

/** Tron base58 -> 20-byte EVM hex (for eth_getStorageAt / upgrades-core). */
function tronBase58ToEvmHex(tronWeb, base58) {
  const h = tronWeb.address.toHex(base58).replace(/^0x/i, "");
  return "0x" + h.slice(-40);
}

/** EVM 20-byte hex -> Tron base58 (for TronBox contract.at). */
function evmHexToTronBase58(tronWeb, evmHex) {
  const h = evmHex.replace(/^0x/i, "").toLowerCase();
  return tronWeb.address.fromHex("41" + h.slice(-40));
}

function rpcFullHost(networkName) {
  if (networkName === "shasta") {
    return process.env.TRON_FULL_HOST_SHASTA || "https://api.shasta.trongrid.io";
  }
  return process.env.TRON_FULL_HOST_MAINNET || "https://api.trongrid.io";
}

module.exports = async function (deployer, networkName) {
  if (!proxyContractAddress) {
    throw new Error(
      "Set GATEWAY_PROXY_TRON in contracts/.env to the transparent proxy base58 address " +
        "(the address from migration 1 / `deployProxy`, NOT the new implementation contract from " +
        "`deployer.deploy(Gateway)` in this migration). Example Paycrest mainnet proxy: " +
        "THyFP5ST9YyLZn6EzjKjFhZti6aKPgEXNU"
    );
  }

  console.warn("");
  console.warn("----------------------------------------------------------------");
  console.warn("  MIGRATION 2 first deploys a NEW Gateway IMPLEMENTATION (costs energy/TRX).");
  console.warn("  Your product must keep using the PROXY address from migration 1 — see GATEWAY_PROXY_TRON.");
  console.warn("  The implementation address printed below is NOT the upgradeable entrypoint.");
  console.warn("----------------------------------------------------------------");
  console.warn("");

  try {
    const tronWeb = new TronWeb({
      fullHost: rpcFullHost(networkName),
    });

    console.info("--- Gateway upgrade ---");
    console.info("Network:", networkName || "(unknown)");
    console.info("Transparent proxy (upgrade target):", proxyContractAddress);

    await deployer.deploy(Gateway);
    const newImplBase58 = Gateway.address;
    console.info("New Gateway implementation deployed at:", newImplBase58);
    console.info(
      "(If you only see one new address in TronScan, that is usually the implementation; " +
        "the proxy address above must stay the same across upgrades.)"
    );

    let proxyAdminBase58 = process.env.GATEWAY_PROXY_ADMIN_TRON;
    if (!proxyAdminBase58) {
      const wrapped = wrapProvider(deployer.provider);
      const proxyEvmHex = tronBase58ToEvmHex(tronWeb, proxyContractAddress);
      const adminEvmHex = await getAdminAddress(wrapped, proxyEvmHex);
      proxyAdminBase58 = evmHexToTronBase58(tronWeb, adminEvmHex);
      console.info("Resolved ProxyAdmin (EIP-1967):", proxyAdminBase58);
    } else {
      console.info("Using GATEWAY_PROXY_ADMIN_TRON from env");
    }

    const adminContract = await ProxyAdmin.at(proxyAdminBase58);
    console.info("Calling ProxyAdmin.upgrade(proxy, newImplementation)...");
    await adminContract.upgrade(proxyContractAddress, newImplBase58);
    console.info("✅ Upgrade transaction submitted for proxy:", proxyContractAddress);

    const wrapped = wrapProvider(deployer.provider);
    const implEvm = await getImplementationAddress(
      wrapped,
      tronBase58ToEvmHex(tronWeb, proxyContractAddress)
    );
    const implB58 = evmHexToTronBase58(tronWeb, implEvm);
    console.info("Proxy implementation slot now points to:", implB58);
    if (implB58 !== newImplBase58) {
      console.warn(
        "Warning: on-chain implementation address does not match the contract just deployed. " +
          "Wait for confirmation or check RPC / explorer."
      );
    }
  } catch (error) {
    console.error("Transparent proxy upgrade error:", error);
    if (String(error.message || error).includes("429")) {
      console.error(
        "HTTP 429: TronGrid rate limit. Set TRON_FULL_HOST_MAINNET or TRON_FULL_HOST_SHASTA to an RPC with a higher quota, wait, and re-run."
      );
    }
    throw error;
  }
};
