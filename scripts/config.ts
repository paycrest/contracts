import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

let { INFURA_API_KEY } = process.env;

const NETWORKS = {
  /**
   * @dev Arbitrum One
   */
  42161: {
    RPC_URL: "https://arb1.arbitrum.io/rpc",
    SUPPORTED_TOKENS: {
      USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      IMPERSONATE_ACCOUNT: "0xe68ee8a12c611fd043fb05d65e1548dc1383f2b9",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Polygon Mumbai
   */
  80001: {
    RPC_URL: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
    SUPPORTED_TOKENS: {
      USDC: "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97",
      USDT: "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "0xba31A1adb519A2C76475cE231FB1445047971358",
    IMPERSONATE_ACCOUNT: "",
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
