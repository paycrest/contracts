// const sdk = require("api")("@tron/v4.7.1#3pbsh37lhr5rz5o");
const Paycrest = require('../artifacts/contracts/Paycrest.sol/Paycrest.json')

const TronWeb = require('tronweb')
const HttpProvider = TronWeb.providers.HttpProvider;
const fullNode = new HttpProvider("https://api.trongrid.io");
const solidityNode = new HttpProvider("https://api.trongrid.io");
const eventServer = new HttpProvider("https://api.trongrid.io");
const privateKey =
  "";
const tronWeb = new TronWeb(fullNode,solidityNode,eventServer,privateKey);
tronWeb.setHeader({
  "TRON-PRO-API-KEY": "",
});

let abi = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_usdc",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "AmountIsZero",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidInstitutionCode",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "what",
          "type": "bytes32"
        }
      ],
      "name": "InvalidParameter",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidSigner",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotWhitelisted",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "OnlyAggregator",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "OrderFulfilled",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ThrowZeroAddress",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ThrowZeroValue",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "TokenNotSupported",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "UnableToProcessRewards",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "Unsuported",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "orderId",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "rate",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "institutionCode",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "messageHash",
          "type": "string"
        }
      ],
      "name": "Deposit",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint64",
          "name": "protocolFee",
          "type": "uint64"
        },
        {
          "indexed": false,
          "internalType": "uint64",
          "name": "primaryValidator",
          "type": "uint64"
        },
        {
          "indexed": false,
          "internalType": "uint64",
          "name": "secondaryValidator",
          "type": "uint64"
        }
      ],
      "name": "PaycrestFees",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "orderId",
          "type": "bytes32"
        }
      ],
      "name": "Refunded",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "what",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "value",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "status",
          "type": "bool"
        }
      ],
      "name": "SettingManagerBool",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "what",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "bytes8",
          "name": "value",
          "type": "bytes8"
        },
        {
          "indexed": false,
          "internalType": "bytes8",
          "name": "status",
          "type": "bytes8"
        }
      ],
      "name": "SettingManagerForInstitution",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "orderId",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "liquidityProvider",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint96",
          "name": "settlePercent",
          "type": "uint96"
        }
      ],
      "name": "Settled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "TransferSenderFee",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_token",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_refundAddress",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_senderFeeRecipient",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_senderFee",
          "type": "uint256"
        },
        {
          "internalType": "uint96",
          "name": "_rate",
          "type": "uint96"
        },
        {
          "internalType": "bytes32",
          "name": "_institutionCode",
          "type": "bytes32"
        },
        {
          "internalType": "string",
          "name": "messageHash",
          "type": "string"
        }
      ],
      "name": "createOrder",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "orderId",
          "type": "bytes32"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getFeeDetails",
      "outputs": [
        {
          "internalType": "uint64",
          "name": "",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "",
          "type": "uint64"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getLiquidityAggregator",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "_orderId",
          "type": "bytes32"
        }
      ],
      "name": "getOrderInfo",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "seller",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "senderFeeRecipient",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "senderFee",
              "type": "uint256"
            },
            {
              "internalType": "uint96",
              "name": "rate",
              "type": "uint96"
            },
            {
              "internalType": "bool",
              "name": "isFulfilled",
              "type": "bool"
            },
            {
              "internalType": "address",
              "name": "refundAddress",
              "type": "address"
            },
            {
              "internalType": "uint96",
              "name": "currentBPS",
              "type": "uint96"
            },
            {
              "internalType": "uint256",
              "name": "amount",
              "type": "uint256"
            }
          ],
          "internalType": "struct IPaycrest.Order",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "code",
          "type": "bytes32"
        }
      ],
      "name": "getSupportedInstitutionName",
      "outputs": [
        {
          "components": [
            {
              "internalType": "bytes32",
              "name": "name",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "currency",
              "type": "bytes32"
            }
          ],
          "internalType": "struct PaycrestSettingManager.InstitutionByCode",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "currency",
          "type": "bytes32"
        }
      ],
      "name": "getSupportedInstitutions",
      "outputs": [
        {
          "components": [
            {
              "internalType": "bytes32",
              "name": "code",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "name",
              "type": "bytes32"
            }
          ],
          "internalType": "struct PaycrestSettingManager.Institution[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "getWhitelistedStatus",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_token",
          "type": "address"
        }
      ],
      "name": "isTokenSupported",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "_orderId",
          "type": "bytes32"
        }
      ],
      "name": "refund",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "renounceOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "currency",
          "type": "bytes32"
        },
        {
          "components": [
            {
              "internalType": "bytes32",
              "name": "code",
              "type": "bytes32"
            },
            {
              "internalType": "bytes32",
              "name": "name",
              "type": "bytes32"
            }
          ],
          "internalType": "struct PaycrestSettingManager.Institution[]",
          "name": "institutions",
          "type": "tuple[]"
        }
      ],
      "name": "setSupportedInstitutions",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "what",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "value",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "status",
          "type": "bool"
        }
      ],
      "name": "settingManagerBool",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "_orderId",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "_primaryValidator",
          "type": "address"
        },
        {
          "internalType": "address[]",
          "name": "_secondaryValidators",
          "type": "address[]"
        },
        {
          "internalType": "address",
          "name": "_liquidityProvider",
          "type": "address"
        },
        {
          "internalType": "uint96",
          "name": "_settlePercent",
          "type": "uint96"
        }
      ],
      "name": "settle",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "what",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "value",
          "type": "address"
        }
      ],
      "name": "updateFeeRecipient",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint64",
          "name": "_protocolFeePercent",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "_primaryValidatorPercent",
          "type": "uint64"
        },
        {
          "internalType": "uint64",
          "name": "_secondaryValidatorPercent",
          "type": "uint64"
        }
      ],
      "name": "updateProtocolFees",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
let deployedBytescode =
  "0x608060405234801561001057600080fd5b506004361061010b5760003560e01c8063764bc355116100a257806399e3c0b41161007157806399e3c0b4146102ca578063b810c636146102e6578063d8e8de3414610307578063e5b32cdf14610337578063f2fde38b146103675761010b565b8063764bc35514610230578063768c6ec01461024c57806387490d861461027c5780638da5cb5b146102ac5761010b565b80633d8f8fb2116100de5780633d8f8fb2146101aa578063715018a6146101c65780637249fbb6146101d057806375151b63146102005761010b565b806302621338146101105780632ebc5356146101405780632f37cf961461015e578063322008821461018e575b600080fd5b61012a600480360381019061012591906121d1565b610383565b60405161013791906122eb565b60405180910390f35b6101486104c1565b604051610155919061234e565b60405180910390f35b61017860048036038101906101739190612474565b6104eb565b6040516101859190612559565b60405180910390f35b6101a860048036038101906101a39190612718565b6109a4565b005b6101c460048036038101906101bf9190612774565b610ab8565b005b6101ce610c6a565b005b6101ea60048036038101906101e591906121d1565b610c7e565b6040516101f791906127cf565b60405180910390f35b61021a600480360381019061021591906127ea565b610f0e565b60405161022791906127cf565b60405180910390f35b61024a60048036038101906102459190612857565b610f64565b005b610266600480360381019061026191906121d1565b611027565b604051610273919061299d565b60405180910390f35b610296600480360381019061029191906121d1565b611258565b6040516102a391906129e8565b60405180910390f35b6102b4611299565b6040516102c1919061234e565b60405180910390f35b6102e460048036038101906102df9190612a2f565b6112c2565b005b6102ee6114af565b6040516102fe9493929190612aa0565b60405180910390f35b610321600480360381019061031c91906127ea565b61150c565b60405161032e91906127cf565b60405180910390f35b610351600480360381019061034c9190612b3b565b611562565b60405161035e91906127cf565b60405180910390f35b610381600480360381019061037c91906127ea565b611a95565b005b6060600060076000848152602001908152602001600020805480602002602001604051908101604052809291908181526020016000905b82821015610400578382906000526020600020906002020160405180604001604052908160008201548152602001600182015481525050815260200190600101906103ba565b50505050905060008151905060008167ffffffffffffffff81111561042857610427612585565b5b60405190808252806020026020018201604052801561046157816020015b61044e612085565b8152602001906001900390816104465790505b50905060005b828110156104b55783818151811061048257610481612bd5565b5b602002602001015182828151811061049d5761049c612bd5565b5b60200260200101819052508080600101915050610467565b50809350505050919050565b6000600460009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b6000600660003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16610570576040517f584a793800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b61057c8a8a8a87611b18565b8973ffffffffffffffffffffffffffffffffffffffff166323b872dd33308c6040518463ffffffff1660e01b81526004016105b993929190612c04565b6020604051808303816000875af11580156105d8573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906105fc9190612c50565b50600a60003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600081548092919061064d90612cac565b919050555033600a60003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020546040516020016106a4929190612cf4565b6040516020818303038152906040528051906020012090506040518061012001604052803373ffffffffffffffffffffffffffffffffffffffff1681526020018b73ffffffffffffffffffffffffffffffffffffffff1681526020018873ffffffffffffffffffffffffffffffffffffffff168152602001878152602001866bffffffffffffffffffffffff1681526020016000151581526020018973ffffffffffffffffffffffffffffffffffffffff168152602001620186a06bffffffffffffffffffffffff1681526020018a8152506009600083815260200190815260200160002060008201518160000160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060208201518160010160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060408201518160020160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506060820151816003015560808201518160040160006101000a8154816bffffffffffffffffffffffff02191690836bffffffffffffffffffffffff16021790555060a082015181600401600c6101000a81548160ff02191690831515021790555060c08201518160050160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060e08201518160050160146101000a8154816bffffffffffffffffffffffff02191690836bffffffffffffffffffffffff1602179055506101008201518160060155905050846bffffffffffffffffffffffff1689827fbcd03c92e4cfe8dc461872f6cd67c811155fa7d92c918619e82e6b6b44733e7e87878760405161098f93929190612d6a565b60405180910390a49998505050505050505050565b6109ac611c93565b60008151905060005b81811015610ab257600760008581526020019081526020016000208382815181106109e3576109e2612bd5565b5b60200260200101519080600181540180825580915050600190039060005260206000209060020201600090919091909150600082015181600001556020820151816001015550506040518060400160405280848381518110610a4857610a47612bd5565b5b60200260200101516020015181526020018581525060086000858481518110610a7457610a73612bd5565b5b6020026020010151600001518152602001908152602001600020600082015181600001556020820151816001015590505080806001019150506109b5565b50505050565b610ac0611c93565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603610b26576040517f9c8e2b5d00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b7f66656500000000000000000000000000000000000000000000000000000000008203610b8f5780600260006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505b7f61676772656761746f72000000000000000000000000000000000000000000008203610bfc5780600460006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550610c66565b7f7374616b650000000000000000000000000000000000000000000000000000008203610c655780600360006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505b5b5050565b610c72611c93565b610c7c6000611d11565b565b6000600460009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610d07576040517fe9d8299200000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60096000838152602001908152602001600020600401600c9054906101000a900460ff1615610d62576040517f56f1733f00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600160096000848152602001908152602001600020600401600c6101000a81548160ff02191690831515021790555060006009600084815260200190815260200160002060050160146101000a8154816bffffffffffffffffffffffff02191690836bffffffffffffffffffffffff1602179055506009600083815260200190815260200160002060010160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb6009600085815260200190815260200160002060050160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1660096000868152602001908152602001600020600601546040518363ffffffff1660e01b8152600401610e94929190612cf4565b6020604051808303816000875af1158015610eb3573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610ed79190612c50565b50817ffe509803c09416b28ff3d8f690c8b0c61462a892c46d5430c8fb20abe472daf060405160405180910390a260019050919050565b6000600560008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff169050919050565b610f6c611c93565b82600060146101000a81548167ffffffffffffffff021916908367ffffffffffffffff16021790555081600160006101000a81548167ffffffffffffffff021916908367ffffffffffffffff16021790555080600160086101000a81548167ffffffffffffffff021916908367ffffffffffffffff1602179055507fced6b79f1325154aec329e6ff932857cb4f91fa8eb4c6791ce5b460f4799575883838360405161101a93929190612d9c565b60405180910390a1505050565b61102f6120a5565b60096000838152602001908152602001600020604051806101200160405290816000820160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020016001820160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020016002820160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001600382015481526020016004820160009054906101000a90046bffffffffffffffffffffffff166bffffffffffffffffffffffff166bffffffffffffffffffffffff16815260200160048201600c9054906101000a900460ff161515151581526020016005820160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020016005820160149054906101000a90046bffffffffffffffffffffffff166bffffffffffffffffffffffff166bffffffffffffffffffffffff1681526020016006820154815250509050919050565b611260612167565b60086000838152602001908152602001600020604051806040016040529081600082015481526020016001820154815250509050919050565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b6112ca611c93565b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603611330576040517f9c8e2b5d00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b7f746f6b656e00000000000000000000000000000000000000000000000000000083036113af5780600560008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff0219169083151502179055505b7f77686974656c697374000000000000000000000000000000000000000000000083036114325780600660008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff02191690831515021790555061146f565b826040517f48bae5b80000000000000000000000000000000000000000000000000000000081526004016114669190612559565b60405180910390fd5b7fe22cadcc5ddbc0a185e8920eaa6825bcc06dcd6b432988e7e9912caa59ace9308383836040516114a293929190612dd3565b60405180910390a1505050565b600080600080600060149054906101000a900467ffffffffffffffff16600160009054906101000a900467ffffffffffffffff16600160089054906101000a900467ffffffffffffffff16620186a0935093509350935090919293565b6000600660008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff169050919050565b6000600460009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16146115eb576040517fe9d8299200000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60096000888152602001908152602001600020600401600c9054906101000a900460ff1615611646576040517f56f1733f00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60006009600089815260200190815260200160002060010160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905082600960008a815260200190815260200160002060050160148282829054906101000a90046bffffffffffffffffffffffff166116be9190612e0a565b92506101000a8154816bffffffffffffffffffffffff02191690836bffffffffffffffffffffffff1602179055506000600960008a815260200190815260200160002060050160149054906101000a90046bffffffffffffffffffffffff166bffffffffffffffffffffffff1603611760576001600960008a8152602001908152602001600020600401600c6101000a81548160ff0219169083151502179055505b6000806000806117708c88611dd5565b93509350935093506117818c611f29565b8473ffffffffffffffffffffffffffffffffffffffff1663a9059cbb600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16866040518363ffffffff1660e01b81526004016117de929190612cf4565b6020604051808303816000875af11580156117fd573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906118219190612c50565b508473ffffffffffffffffffffffffffffffffffffffff1663a9059cbb89856040518363ffffffff1660e01b815260040161185d929190612cf4565b6020604051808303816000875af115801561187c573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906118a09190612c50565b508473ffffffffffffffffffffffffffffffffffffffff1663a9059cbb600360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1683856118ec9190612e4a565b6040518363ffffffff1660e01b8152600401611909929190612cf4565b6020604051808303816000875af1158015611928573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061194c9190612c50565b506000600360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16634a223c368e888f8f8f89896040518863ffffffff1660e01b81526004016119b69796959493929190612f32565b6020604051808303816000875af11580156119d5573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906119f99190612c50565b905080611a32576040517fbcb00c1600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8873ffffffffffffffffffffffffffffffffffffffff168d7fce38752ac5ed47dd3cff11297a4261a0c644be6ca65dc3fc7ae1c3a97c209e338a604051611a799190612fab565b60405180910390a3600196505050505050509695505050505050565b611a9d611c93565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603611b0c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401611b0390613038565b60405180910390fd5b611b1581611d11565b50565b600560008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16611b9b576040517f3dd1b30500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008303611bd5576040517f43ad20fc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff1603611c3b576040517f9c8e2b5d00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000801b600860008381526020019081526020016000206000015403611c8d576040517f38f5fc3500000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b50505050565b611c9b61207d565b73ffffffffffffffffffffffffffffffffffffffff16611cb9611299565b73ffffffffffffffffffffffffffffffffffffffff1614611d0f576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401611d06906130a4565b60405180910390fd5b565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff169050816000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055508173ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a35050565b600080600080600060096000888152602001908152602001600020600601549050600960008881526020019081526020016000206003015481611e1891906130c4565b9050620186a0866bffffffffffffffffffffffff1682611e3891906130f8565b611e429190613169565b9350620186a0600060149054906101000a900467ffffffffffffffff1667ffffffffffffffff1685611e7491906130f8565b611e7e9190613169565b94508484611e8c91906130c4565b9350620186a0600160009054906101000a900467ffffffffffffffff1667ffffffffffffffff1686611ebe91906130f8565b611ec89190613169565b9250620186a0600160089054906101000a900467ffffffffffffffff1667ffffffffffffffff1686611efa91906130f8565b611f049190613169565b91508183611f129190612e4a565b85611f1d91906130c4565b94505092959194509250565b60006009600083815260200190815260200160002060020160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1690506000600960008481526020019081526020016000206003015490506009600084815260200190815260200160002060010160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb83836040518363ffffffff1660e01b8152600401611ff0929190612cf4565b6020604051808303816000875af115801561200f573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906120339190612c50565b50808273ffffffffffffffffffffffffffffffffffffffff167f96c76d5aec8a8c11a9c8e02768e3fa309347330d08961e0cf9fd43b349b684c260405160405180910390a3505050565b600033905090565b604051806040016040528060008019168152602001600080191681525090565b604051806101200160405280600073ffffffffffffffffffffffffffffffffffffffff168152602001600073ffffffffffffffffffffffffffffffffffffffff168152602001600073ffffffffffffffffffffffffffffffffffffffff1681526020016000815260200160006bffffffffffffffffffffffff168152602001600015158152602001600073ffffffffffffffffffffffffffffffffffffffff16815260200160006bffffffffffffffffffffffff168152602001600081525090565b604051806040016040528060008019168152602001600080191681525090565b6000604051905090565b600080fd5b600080fd5b6000819050919050565b6121ae8161219b565b81146121b957600080fd5b50565b6000813590506121cb816121a5565b92915050565b6000602082840312156121e7576121e6612191565b5b60006121f5848285016121bc565b91505092915050565b600081519050919050565b600082825260208201905092915050565b6000819050602082019050919050565b6122338161219b565b82525050565b60408201600082015161224f600085018261222a565b506020820151612262602085018261222a565b50505050565b60006122748383612239565b60408301905092915050565b6000602082019050919050565b6000612298826121fe565b6122a28185612209565b93506122ad8361221a565b8060005b838110156122de5781516122c58882612268565b97506122d083612280565b9250506001810190506122b1565b5085935050505092915050565b60006020820190508181036000830152612305818461228d565b905092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006123388261230d565b9050919050565b6123488161232d565b82525050565b6000602082019050612363600083018461233f565b92915050565b6123728161232d565b811461237d57600080fd5b50565b60008135905061238f81612369565b92915050565b6000819050919050565b6123a881612395565b81146123b357600080fd5b50565b6000813590506123c58161239f565b92915050565b60006bffffffffffffffffffffffff82169050919050565b6123ec816123cb565b81146123f757600080fd5b50565b600081359050612409816123e3565b92915050565b600080fd5b600080fd5b600080fd5b60008083601f8401126124345761243361240f565b5b8235905067ffffffffffffffff81111561245157612450612414565b5b60208301915083600182028301111561246d5761246c612419565b5b9250929050565b60008060008060008060008060006101008a8c03121561249757612496612191565b5b60006124a58c828d01612380565b99505060206124b68c828d016123b6565b98505060406124c78c828d01612380565b97505060606124d88c828d01612380565b96505060806124e98c828d016123b6565b95505060a06124fa8c828d016123fa565b94505060c061250b8c828d016121bc565b93505060e08a013567ffffffffffffffff81111561252c5761252b612196565b5b6125388c828d0161241e565b92509250509295985092959850929598565b6125538161219b565b82525050565b600060208201905061256e600083018461254a565b92915050565b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6125bd82612574565b810181811067ffffffffffffffff821117156125dc576125db612585565b5b80604052505050565b60006125ef612187565b90506125fb82826125b4565b919050565b600067ffffffffffffffff82111561261b5761261a612585565b5b602082029050602081019050919050565b600080fd5b6000604082840312156126475761264661262c565b5b61265160406125e5565b90506000612661848285016121bc565b6000830152506020612675848285016121bc565b60208301525092915050565b600061269461268f84612600565b6125e5565b905080838252602082019050604084028301858111156126b7576126b6612419565b5b835b818110156126e057806126cc8882612631565b8452602084019350506040810190506126b9565b5050509392505050565b600082601f8301126126ff576126fe61240f565b5b813561270f848260208601612681565b91505092915050565b6000806040838503121561272f5761272e612191565b5b600061273d858286016121bc565b925050602083013567ffffffffffffffff81111561275e5761275d612196565b5b61276a858286016126ea565b9150509250929050565b6000806040838503121561278b5761278a612191565b5b6000612799858286016121bc565b92505060206127aa85828601612380565b9150509250929050565b60008115159050919050565b6127c9816127b4565b82525050565b60006020820190506127e460008301846127c0565b92915050565b600060208284031215612800576127ff612191565b5b600061280e84828501612380565b91505092915050565b600067ffffffffffffffff82169050919050565b61283481612817565b811461283f57600080fd5b50565b6000813590506128518161282b565b92915050565b6000806000606084860312156128705761286f612191565b5b600061287e86828701612842565b935050602061288f86828701612842565b92505060406128a086828701612842565b9150509250925092565b6128b38161232d565b82525050565b6128c281612395565b82525050565b6128d1816123cb565b82525050565b6128e0816127b4565b82525050565b610120820160008201516128fd60008501826128aa565b50602082015161291060208501826128aa565b50604082015161292360408501826128aa565b50606082015161293660608501826128b9565b50608082015161294960808501826128c8565b5060a082015161295c60a08501826128d7565b5060c082015161296f60c08501826128aa565b5060e082015161298260e08501826128c8565b506101008201516129976101008501826128b9565b50505050565b6000610120820190506129b360008301846128e6565b92915050565b6040820160008201516129cf600085018261222a565b5060208201516129e2602085018261222a565b50505050565b60006040820190506129fd60008301846129b9565b92915050565b612a0c816127b4565b8114612a1757600080fd5b50565b600081359050612a2981612a03565b92915050565b600080600060608486031215612a4857612a47612191565b5b6000612a56868287016121bc565b9350506020612a6786828701612380565b9250506040612a7886828701612a1a565b9150509250925092565b612a8b81612817565b82525050565b612a9a81612395565b82525050565b6000608082019050612ab56000830187612a82565b612ac26020830186612a82565b612acf6040830185612a82565b612adc6060830184612a91565b95945050505050565b60008083601f840112612afb57612afa61240f565b5b8235905067ffffffffffffffff811115612b1857612b17612414565b5b602083019150836020820283011115612b3457612b33612419565b5b9250929050565b60008060008060008060a08789031215612b5857612b57612191565b5b6000612b6689828a016121bc565b9650506020612b7789828a01612380565b955050604087013567ffffffffffffffff811115612b9857612b97612196565b5b612ba489828a01612ae5565b94509450506060612bb789828a01612380565b9250506080612bc889828a016123fa565b9150509295509295509295565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b6000606082019050612c19600083018661233f565b612c26602083018561233f565b612c336040830184612a91565b949350505050565b600081519050612c4a81612a03565b92915050565b600060208284031215612c6657612c65612191565b5b6000612c7484828501612c3b565b91505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000612cb782612395565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203612ce957612ce8612c7d565b5b600182019050919050565b6000604082019050612d09600083018561233f565b612d166020830184612a91565b9392505050565b600082825260208201905092915050565b82818337600083830152505050565b6000612d498385612d1d565b9350612d56838584612d2e565b612d5f83612574565b840190509392505050565b6000604082019050612d7f600083018661254a565b8181036020830152612d92818486612d3d565b9050949350505050565b6000606082019050612db16000830186612a82565b612dbe6020830185612a82565b612dcb6040830184612a82565b949350505050565b6000606082019050612de8600083018661254a565b612df5602083018561233f565b612e0260408301846127c0565b949350505050565b6000612e15826123cb565b9150612e20836123cb565b925082820390506bffffffffffffffffffffffff811115612e4457612e43612c7d565b5b92915050565b6000612e5582612395565b9150612e6083612395565b9250828201905080821115612e7857612e77612c7d565b5b92915050565b600082825260208201905092915050565b6000819050919050565b6000612ea583836128aa565b60208301905092915050565b6000612ec06020840184612380565b905092915050565b6000602082019050919050565b6000612ee18385612e7e565b9350612eec82612e8f565b8060005b85811015612f2557612f028284612eb1565b612f0c8882612e99565b9750612f1783612ec8565b925050600181019050612ef0565b5085925050509392505050565b600060c082019050612f47600083018a61254a565b612f54602083018961233f565b612f61604083018861233f565b8181036060830152612f74818688612ed5565b9050612f836080830185612a91565b612f9060a0830184612a91565b98975050505050505050565b612fa5816123cb565b82525050565b6000602082019050612fc06000830184612f9c565b92915050565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b6000613022602683612d1d565b915061302d82612fc6565b604082019050919050565b6000602082019050818103600083015261305181613015565b9050919050565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b600061308e602083612d1d565b915061309982613058565b602082019050919050565b600060208201905081810360008301526130bd81613081565b9050919050565b60006130cf82612395565b91506130da83612395565b92508282039050818111156130f2576130f1612c7d565b5b92915050565b600061310382612395565b915061310e83612395565b925082820261311c81612395565b9150828204841483151761313357613132612c7d565b5b5092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b600061317482612395565b915061317f83612395565b92508261318f5761318e61313a565b5b82820490509291505056fea2646970667358221220ddf5bd78707194f774bc7424d874d61cefad161c13464f68f1f97ae53679e36064736f6c63430008120033";
// console.log(abi, deployedBytescode);

// console.log(tronWeb);
// async function deploy_contract(){
//       let contract_instance = await tronWeb.contract().new({
//         abi: abi,
//         bytecode: deployedBytescode,
//         feeLimit: 1000000000,
//         callValue: 0,
//         userFeePercentage: 1,
//         originEnergyLimit: 10000000,
//         parameters: ["TTxab5eMa5NoLXt8r1Yno1zvvQWPLNmbRA"],
//       });
//   console.log(contract_instance.address);
// }
async function contractInstance(){ await tronWeb
  .contract()
  .new({
    abi: abi,
    bytecode: deployedBytescode,
    feeLimit: 1000000000,
    callValue: 0,
    userFeePercentage: 1,
    originEnergyLimit: 10000000,
    parameters: ["TU1ntBzpGPp7GJkzxLTKwYsneJ9JKUmBCK"],
  })
  .catch((error) => {
    console.error("Error deploying contract:", error);
  });
}
contractInstance()

if (contractInstance) {
  console.log("Contract deployed at:", contractInstance.address);
}

// deploy_contract()