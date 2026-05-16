const path = require("path");
const dotenv = require("dotenv");

// Use the parent contracts package .env (single source of truth)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

module.exports = {
  // Solidity sources live in ../contracts; this folder symlinks ./contracts -> there
  // so TronBox keeps paths inside the project directory.
  migrations_directory: path.join(__dirname, "migrations"),
  networks: {
    mainnet: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY_TRON,
      userFeePercentage: 100,
      feeLimit: 2e9,
      // Public TronGrid returns HTTP 429 when rate-limited. Use a dedicated URL
      // (e.g. TronGrid + API key via a proxy, QuickNode, self-hosted fullnode).
      fullHost: process.env.TRON_FULL_HOST_MAINNET || "https://api.trongrid.io",
      network_id: "1",
    },
    shasta: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY_TRON,
      userFeePercentage: 100,
      feeLimit: 2e9,
      fullHost: process.env.TRON_FULL_HOST_SHASTA || "https://api.shasta.trongrid.io",
      network_id: "2",
    },
  },
  compilers: {
    solc: {
      version: "0.8.18",
    },
  },
  solc: {},
};
