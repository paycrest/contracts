import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

let { SHIELD3_API_KEY } = process.env;

const NETWORKS = {
  /////////////////////////////////
  // Mainnets
  /////////////////////////////////

  /**
   * @dev Arbitrum One
   */
  42161: {
    RPC_URL: `https://rpc.shield3.com/v3/0xa4b1/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      IMPERSONATE_ACCOUNT: "",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Base
   */
  8453: {
    RPC_URL: `https://rpc.shield3.com/v3/0x2105/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Binance Smart Chain
   */
  56: {
    RPC_URL: `https://rpc.shield3.com/v3/0x38/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      USDT: "0x55d398326f99059ff775485246999027b3197955",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Polygon Mainnet
   */
  137: {
    RPC_URL: `https://rpc.shield3.com/v3/0x89/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Ethereum Mainnet
   */
  1: {
    RPC_URL: `https://rpc.shield3.com/v3/0x1/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /////////////////////////////////
  // Testnets
  /////////////////////////////////

  /**
   * @dev Polygon Amoy
   */
  80002: {
    RPC_URL: `https://rpc.shield3.com/v3/0x13882/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Arbitrum Sepolia
   */
  421614: {
    RPC_URL: `https://rpc.shield3.com/v3/0x66eee/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Base Sepolia
   */
  84532: {
    RPC_URL: `https://rpc.shield3.com/v3/0x14a34/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "",
    IMPERSONATE_ACCOUNT: "",
  },

  /**
   * @dev Ethereum Sepolia
   */
  11155111: {
    RPC_URL: `https://rpc.shield3.com/v3/0xaa36a7/${SHIELD3_API_KEY}/rpc`,
    SUPPORTED_TOKENS: {
      "6TEST": "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B",
    },
    TREASURY_FEE_PERCENT: 100, // in BPS i.e 0.1%
    PAYCREST_CONTRACT: "0x16c9C78Dbb224889E3e2ADef991C8c4438ea797B",
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
      name: ethers.utils.formatBytes32String("SAFE HAVEN MICROFINANCE BANK"),
    }
  ]
};

export { NETWORKS, CURRENCIES, INSTITUTIONS };
