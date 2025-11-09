import dotenv from "dotenv";

dotenv.config();

let { SHIELD3_API_KEY } = process.env;

// MAX BPS = 100000
const SENDER_TO_PROVIDER_FEE = 50000; // 50%
const LOCAL_PROVIDER_TO_AGGREGATOR_FEE = 50000; // 50%
const SENDER_TO_AGGREGATOR_FEE = 0;
const FX_PROVIDER_TO_AGGREGATOR_FEE = 500; // 0.5%

const NETWORKS = {
	/////////////////////////////////
	// Mainnets
	/////////////////////////////////

	/**
	 * @dev Arbitrum One
	 */
	42161: {
		rpcUrl: `https://rpc.shield3.com/v3/0xa4b1/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0xE8bc3B607CfE68F47000E3d200310D49041148Fc",
	},

	/**
	 * @dev Base
	 */
	8453: {
		gatewayImplementation: "0xd28da2E11FCd2A9F44D5a4952430CE8b4f3Ee05f",
		rpcUrl: `https://rpc.shield3.com/v3/0x2105/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F",
	},

	/**
	 * @dev Binance Smart Chain
	 */
	56: {
		rpcUrl: `https://rpc.shield3.com/v3/0x38/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0x55d398326f99059ff775485246999027b3197955",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0xa8AEA66B361a8d53e8865c62D142167Af28Af058",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0x1FA0EE7F9410F6fa49B7AD5Da72Cf01647090028",
	},

	/**
	 * @dev Polygon Mainnet
	 */
	137: {
		rpcUrl: `https://rpc.shield3.com/v3/0x89/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x52828daa48C1a9A06F37500882b42daf0bE04C3B",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0xfB411Cc6385Af50A562aFCb441864E9d541CDA67",
	},

	/**
	 * @dev Ethereum Mainnet
	 */
	1: {
		rpcUrl: `https://rpc.shield3.com/v3/0x1/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			CNGN: {
				address: "0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0x8d2C0D398832b814e3814802FF2dC8b8eF4381e5",
	},

	/**
	 * @dev Optimism Mainnet
	 */
	10: {
		rpcUrl: `https://rpc.shield3.com/v3/0xa/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0xD293fCd3dBc025603911853d893A4724CF9f70a0",
	},

	/**
	 * @dev Scroll Mainnet
	 */
	534352: {
		rpcUrl: `https://rpc.shield3.com/v3/0x82750/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0x663C5BfE7d44bA946C2dd4b2D1Cf9580319F9338",
	},

	/**
	 * @dev Tron Mainnet
	 * @Note This is a placeholder network as Tron chainID will interfere with ETH chainID
	 */
	12001: {
		rpcUrl: `https://api.trongrid.io`,
		supportedTokens: {
			USDT: {
				address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "THyFP5ST9YyLZn6EzjKjFhZti6aKPgEXNU",
	},
	/**
	 * @dev Celo Mainnet
	 */
	42220: {
		gatewayImplementation: "0x8508c1C9f29BD1e73B5A9bD8FB87720927c681FA",
		rpcUrl: `https://forno.celo.org`,
		supportedTokens: {
			USDC: {
				address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cUSD: {
				address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDT: {
				address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b",
	},
	/**
	 * @dev AssetChain Mainnet
	 */
	42420: {
		rpcUrl: `https://mainnet-rpc.assetchain.org`,
		gatewayImplementation: "0x3Dc80272cE93cBFF3351913bB089B59C4a9141DE",
		supportedTokens: {
			USDC: {
				address: "0x2B7C1342Cc64add10B2a79C8f9767d2667DE64B2",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x7923C0f6FA3d1BA6EAFCAedAaD93e737Fd22FC4F",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0xff0E00E0110C1FBb5315D276243497b66D3a4d8a",
	},
	/**
	 * @dev Lisk Mainnet
	 */
	1135: {
		rpcUrl: `https://rpc.api.lisk.com`,
		gatewayImplementation: "0x3Dc80272cE93cBFF3351913bB089B59C4a9141DE",
		supportedTokens: {
			USDT: {
				address: "0x05D032ac25d322df992303dCa074EE7392C117b9",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0xff0E00E0110C1FBb5315D276243497b66D3a4d8a",
	},

	/////////////////////////////////
	// Testnets
	/////////////////////////////////

	/**
	 * @dev Polygon Amoy
	 */
	80002: {
		rpcUrl: `https://rpc.shield3.com/v3/0x13882/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x1BE5EaCb5D503fe8D64c810a0b14cdD7eC48df1f",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "",
	},

	/**
	 * @dev Arbitrum Sepolia
	 */
	421614: {
		rpcUrl: `https://rpc.shield3.com/v3/0x66eee/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			"6TEST": {
				address: "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			USDC: {
				address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "0x87B321fc77A0fDD0ca1fEe7Ab791131157B9841A",
	},

	/**
	 * @dev Base Sepolia
	 */
	84532: {
		gatewayImplementation: "0xff0E00E0110C1FBb5315D276243497b66D3a4d8a",
		rpcUrl: `https://rpc.shield3.com/v3/0x14a34/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			USDC: {
				address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			DAI: {
				address: "0x7683022d84f726a96c4a6611cd31dbf5409c0ac9",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x24FcDa8602a75e065c1cc6d765e7Ad3217b2827b",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0x847dfdAa218F9137229CF8424378871A1DA8f625",
	},

	/**
	 * @dev Ethereum Sepolia
	 */
	11155111: {
		rpcUrl: `https://rpc.shield3.com/v3/0xaa36a7/${SHIELD3_API_KEY}/rpc`,
		supportedTokens: {
			"6TEST": {
				address: "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			DAI: {
				address: "0x77Ab54631BfBAE40383c62044dC30B229c7df9f5",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x38528a3100E5e19b3043041FF9b00A983145Fb1A",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0xCAD53Ff499155Cc2fAA2082A85716322906886c2",
	},

	/**
	 * @dev Tron Shasta
	 * @Note This is a placeholder network as Tron chainID will interfere with ETH chainID
	 */
	12002: {
		rpcUrl: `https://api.shasta.trongrid.io`,
		supportedTokens: {
			USDT: {
				address: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
		},
		gatewayContract: "TYA8urq7nkN2yU7rJqAgwDShCusDZrrsxZ",
	},
	/**
	 * @dev AssetChain Testnet
	 */
	42421: {
		gatewayImplementation: "0x9519D63fbF9717Fa3419846eBA92B01Cd1d1D131",
		rpcUrl: `https://enugu-rpc.assetchain.org/`,
		supportedTokens: {
			USDC: {
				address: "0x04f868C5b3F0A100a207c7e9312946cC2c48a7a3",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			},
			cNGN: {
				address: "0x069404d2F76Aa4519819a41B4E385074A9F4E8eA",
				local: {
					senderToProvider: SENDER_TO_PROVIDER_FEE,
					providerToAggregator: LOCAL_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate=1: sender pays
				fx: {
					senderToAggregator: SENDER_TO_AGGREGATOR_FEE,
					providerToAggregator: FX_PROVIDER_TO_AGGREGATOR_FEE,
				}, // rate≠1
			}
		},
		gatewayContract: "0xBe6dE889795677736919A7880324A71Dc7dFa162",
	},
};

export { NETWORKS };
