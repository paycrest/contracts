const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const { getImplementationAddress, getAdminAddress } = require("@openzeppelin/upgrades-core");
const { wrapProvider } = require("@openzeppelin/truffle-upgrades/dist/utils/wrap-provider.js");
const TronWeb = require("tronweb");
const Gateway = artifacts.require("Gateway");

function tronBase58ToEvmHex(tronWeb, base58) {
  const h = tronWeb.address.toHex(base58).replace(/^0x/i, "");
  return "0x" + h.slice(-40);
}

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

/**
 * Deploys OpenZeppelin TransparentUpgradeableProxy + ProxyAdmin + Gateway implementation.
 * The address you MUST use in production is the PROXY (first address below).
 */
module.exports = async function (deployer, networkName) {
  try {
    deployer.trufflePlugin = true;

    const gatewayAtProxy = await deployProxy(Gateway, {
      deployer,
    });
    const proxyAddress = gatewayAtProxy.address;

    const tronWeb = new TronWeb({
      fullHost: rpcFullHost(networkName || "mainnet"),
    });
    const wrapped = wrapProvider(deployer.provider);
    const proxyEvm = tronBase58ToEvmHex(tronWeb, proxyAddress);

    const implEvm = await getImplementationAddress(wrapped, proxyEvm);
    const implBase58 = evmHexToTronBase58(tronWeb, implEvm);

    const adminEvm = await getAdminAddress(wrapped, proxyEvm);
    const adminBase58 = evmHexToTronBase58(tronWeb, adminEvm);

    console.info("");
    console.info("================================================================");
    console.info("  TRON — UPGRADEABLE GATEWAY (save all three addresses)");
    console.info("================================================================");
    console.info("");
    console.info("  1) TRANSPARENT PROXY — use this in apps / config / integrations");
    console.info("     (name on TronScan: TransparentUpgradeableProxy, not Gateway)");
    console.info("     ", proxyAddress);
    console.info("");
    console.info("  2) Gateway IMPLEMENTATION — changes when you run migration 2 upgrade");
    console.info("     (TronScan may label this contract name as Gateway; do NOT use as sole app address)");
    console.info("     ", implBase58);
    console.info("");
    console.info("  3) ProxyAdmin — upgrades are executed by this contract’s owner");
    console.info("     ", adminBase58);
    console.info("");
    console.info("================================================================");
    console.info("  Do NOT point users at the implementation address (2) alone.");
    console.info("  Migration 2 deploys a NEW implementation first — that is NOT the proxy.");
    console.info("================================================================");
    console.info("");
  } catch (error) {
    console.error("Transparent proxy deploy error:", error);
    throw error;
  }
};
