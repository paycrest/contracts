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
    PROTOCOL_FEE_PERCENT: 5000,
    VALIDATOR_FEE_PERCENT: 500,
    SET_MINIMUM_AMOUNT: {
      USDC: 10000, // EXPECTED TO USE ETHERS FOR CONVERSION BASE ON TOKEN DECIMALS
      USDT: 20000, // EXPECTED TO USE ETHERS FOR CONVERSION BASE ON TOKEN DECIMALS
      DERC20: 30000, // EXPECTED TO USE ETHERS FOR CONVERSION BASE ON TOKEN DECIMALS
    },
    VALIDATORS_STATUS: true,
    CREATE_ORDER_PARAMS: {
      CREATE_ORDER_AMOUNT: "0.01",
      CREATE_ORDER_WITH_BANK_CODE: "FBNINGLA",
      CREATE_ORDER_RATE: 990,
      SENDER_FEE: 0,
    },
  },
  421613: {
    USDC_ADDRESS: "",
    USDT_ADDRESS: "",
    IMPERSONATE_ACCOUNT: "",
    DERC20_TOKEN: "",
    PAYCREST_VALIDATOR_CONTRACT: "",
    PAYCREST_CONTRACT: "",
    PROTOCOL_FEE_PERCENT: 1,
    VALIDATOR_FEE_PERCENT: 1,
    SET_MINIMUM_AMOUNT: {},
    VALIDATORS_STATUS: true,
    CREATE_ORDER_PARAMS: {
      CREATE_ORDER_AMOUNT: "0.01",
      CREATE_ORDER_WITH_BANK_CODE: "FBNINGLA",
      CREATE_ORDER_RATE: 990,
      SENDER_FEE: 0,
    },
  },
};

const CURRENCIES = [
  {
    code: ethers.utils.formatBytes32String("NGN"),
    name: ethers.utils.formatBytes32String("Nigerian Naira"),
  },
  // Add other currencies here
];

const INSTITUTIONS = {
  "NGN": [
    {
      code: ethers.utils.formatBytes32String("ABNGNGLA"),
      name: ethers.utils.formatBytes32String("ACCESS BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("DBLNNGLA"),
      name: ethers.utils.formatBytes32String("DIAMOND BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("FIDTNGLA"),
      name: ethers.utils.formatBytes32String("FIDELITY BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("FCMBNGLA"),
      name: ethers.utils.formatBytes32String("FIRST CITY MONUMENTAL BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("FBNINGLA"),
      name: ethers.utils.formatBytes32String("FIRST BANK OF NIGERIA"),
    },
    {
      code: ethers.utils.formatBytes32String("GTBINGLA"),
      name: ethers.utils.formatBytes32String("GTBANK PLC"),
    },
    {
      code: ethers.utils.formatBytes32String("PRDTNGLA"),
      name: ethers.utils.formatBytes32String("POLARIS BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("UBNINGLA"),
      name: ethers.utils.formatBytes32String("UNION BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("UNAFNGLA"),
      name: ethers.utils.formatBytes32String("UNITED BANK FOR AFRICA"),
    },
    {
      code: ethers.utils.formatBytes32String("CITINGLA"),
      name: ethers.utils.formatBytes32String("CITIBANK"),
    },
    {
      code: ethers.utils.formatBytes32String("ECOCNGLA"),
      name: ethers.utils.formatBytes32String("ECOBANK"),
    },
    {
      code: ethers.utils.formatBytes32String("HBCLNGLA"),
      name: ethers.utils.formatBytes32String("HERITAGE BANK PLC"),
    },
    {
      code: ethers.utils.formatBytes32String("PLNINGLA"), 
      name: ethers.utils.formatBytes32String("KEYSTONE BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("SBICNGLA"),
      name: ethers.utils.formatBytes32String("STANBIC IBTC BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("SCBLNGLA"),
      name: ethers.utils.formatBytes32String("STANDARD CHARTERED"),
    },
    {
      code: ethers.utils.formatBytes32String("NAMENGLA"),
      name: ethers.utils.formatBytes32String("STERLING BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("ICITNGLA"),
      name: ethers.utils.formatBytes32String("UNITY BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("SUTGNGLA"),
      name: ethers.utils.formatBytes32String("SUNTRUST BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("PROVNGLA"),
      name: ethers.utils.formatBytes32String("PROVIDUS BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("GMBLNGLA"),
      name: ethers.utils.formatBytes32String("GREENWICH MERCHANT BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("FSDHNGLA"),
      name: ethers.utils.formatBytes32String("FSDH MERCHANT BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("KDHLNGLA"),
      name: ethers.utils.formatBytes32String("FBNQUEST MERCHANT BANK"),
    }, 
    {
      code: ethers.utils.formatBytes32String("FIRNNGLA"),
      name: ethers.utils.formatBytes32String("RAND MERCHANT BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("JAIZNGLA"),
      name: ethers.utils.formatBytes32String("JAIZ BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("ZEIBNGLA"),
      name: ethers.utils.formatBytes32String("ZENITH BANK PLC"),
    },
    {
      code: ethers.utils.formatBytes32String("KUDANGPC"),
      name: ethers.utils.formatBytes32String("KUDA MICROFINANCE BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("OPAYNGPC"),
      name: ethers.utils.formatBytes32String("OPAY"),
    },
    {
      code: ethers.utils.formatBytes32String("MONINGPC"),
      name: ethers.utils.formatBytes32String("MONIEPOINT MICROFINANCE BANK"),
    },
    {
      code: ethers.utils.formatBytes32String("PALMNGPC"),
      name: ethers.utils.formatBytes32String("PALMPAY"),
    },
    {
      code: ethers.utils.formatBytes32String("SAHVNGPC"),
      name: ethers.utils.formatBytes32String("SAFEHAVEN MICROFINANCE BANK"),
    }
  ]
};

export { NETWORKS, CURRENCIES, INSTITUTIONS };
