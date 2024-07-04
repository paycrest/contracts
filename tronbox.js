const dotenv = require ("dotenv");
dotenv.config();

module.exports = {
  networks: {
    mainnet: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY_TRON,
      userFeePercentage: 100,
      feeLimit: 2e9,
      fullHost: "https://api.trongrid.io",
      network_id: "1",
    },
    shasta: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY_TRON,
      userFeePercentage: 100,
      feeLimit: 2e9,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2",
    },
    // nile: {
    //   privateKey: process.env.PRIVATE_KEY_NILE,
    //   userFeePercentage: 100,
    //   feeLimit: 1e9,
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
