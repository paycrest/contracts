import ethers from "ethers";

const NETWORKS = {
  /**
   * @dev Arbitrum mainnet
   */
  42161: {
    USDC_ADDRESS: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    USDT_ADDRESS: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    IMPERSONATE_ACCOUNT: "0xe68ee8a12c611fd043fb05d65e1548dc1383f2b9",
    DERC20_TOKEN: "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1",
    PAYCREST_VALIDATOR_CONTRACT: "0x643db3aa8adDFd1877453491d144aD184cf8261b",
    PAYCREST_CONTRACT: "0x643db3aa8adDFd1877453491d144aD184cf8261b",
    CURRENCIES: [
      {
        code: ethers.utils.formatBytes32String("NGN"),
        name: ethers.utils.formatBytes32String("Nigerian Naira"),
      },
      // Add other currencies here
    ],
    BANKS: [
      {
        code: ethers.utils.formatBytes32String("FBNINGLA"),
        name: ethers.utils.formatBytes32String("First Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("OPAYNINGLA"),
        name: ethers.utils.formatBytes32String("Opay"),
      },
      {
        code: ethers.utils.formatBytes32String("PPBNINGLA"),
        name: ethers.utils.formatBytes32String("Palmpay Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("ACBNINGLA"),
        name: ethers.utils.formatBytes32String("Access Bank"),
      },
      {
        code: ethers.utils.formatBytes32String("GTBNINGLA"),
        name: ethers.utils.formatBytes32String("GTB"),
      },
      {
        code: ethers.utils.formatBytes32String("IBTCNINGLA"),
        name: ethers.utils.formatBytes32String("Stanbic IBTC Bank"),
      },
      // Add other banks here
    ],
  },
  421613: {
    USDC_ADDRESS: "",
    USDT_ADDRESS: "",
    IMPERSONATE_ACCOUNT: "",
    CURRENCIES: [], // Add currencies for this network if needed
    BANKS: [], // Add banks for this network if needed
  },
};

export { NETWORKS };
