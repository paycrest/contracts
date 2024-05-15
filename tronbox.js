const port = process.env.HOST_PORT || 9090;

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
      privateKey:
        "3bf7d158422f1c59f1642c241ba9dbf5062e5242e7636d00e7b24a0b262e5dec",
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
    development: {
      // For tronbox/tre docker image
      privateKey:
        "0000000000000000000000000000000000000000000000000000000000000001",
      userFeePercentage: 0,
      feeLimit: 1000 * 1e6,
      fullHost: "http://127.0.0.1:" + port,
      network_id: "9",
    },
    compilers: {
      solc: {
        version: "0.8.18",
      },
    },
  },
  // solc compiler optimize
  solc: {
    //   optimizer: {
    //     enabled: true,
    //     runs: 200
    //   },
    //   evmVersion: 'istanbul'
  },
};
