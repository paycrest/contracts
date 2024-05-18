const port = process.env.HOST_PORT || 9090;
import dotenv from "dotenv";
dotenv.config();

module.exports = {
  networks: {
    // mainnet: {
    //   // Don't put your private key here:
    //   privateKey: process.env.PRIVATE_KEY_MAINNET,
    //   /*
    //   Create a .env file (it must be gitignored) containing something like
    //   export PRIVATE_KEY_MAINNET=4E7FEC...656243
    //   Then, run the migration with:
    //   source .env && tronbox migrate --network mainnet
    //   */
    //   userFeePercentage: 100,
    //   feeLimit: 1000 * 1e6,
    //   fullHost: "https://api.trongrid.io",
    //   network_id: "1",
    // },
    shasta: {
      privateKey: process.env.PRIVATE_KEY_SHASTA,
      userFeePercentage: 100,
      feeLimit: 2000 * 1e6,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2",
    },
    // nile: {
    //   privateKey: process.env.PRIVATE_KEY_NILE,
    //   userFeePercentage: 100,
    //   feeLimit: 1000 * 1e6,
    //   fullHost: "https://nile.trongrid.io",
    //   network_id: "3",
    // },
    compilers: {
      solc: {
        version: "0.8.18",
      },
    },
  },
  // solc compiler optimize
  solc: {},
};
