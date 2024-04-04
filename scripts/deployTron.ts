const TronWeb = require('tronweb');
const Gateway = require('../artifacts/contracts/Gateway.sol/Gateway.json');

const HttpProvider = TronWeb.providers.HttpProvider;
const fullNode = new HttpProvider("https://api.trongrid.io");
const solidityNode = new HttpProvider("https://api.trongrid.io");
const eventServer = new HttpProvider("https://api.trongrid.io");

const privateKey =
  "";

const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);
tronWeb.setHeader({
  "TRON-PRO-API-KEY": "",
});

async function contractInstance() {
  try {
    const tx = await tronWeb
      .contract()
      .new({
        abi: Gateway.abi,
        bytecode: Gateway.deployedBytecode,
        feeLimit: 1000000000,
        callValue: 0,
        userFeePercentage: 1,
        originEnergyLimit: 10000000,
        parameters: ["TU1ntBzpGPp7GJkzxLTKwYsneJ9JKUmBCK"],
      });

    console.log("Contract deployed at:", tx.address);
  } catch (error) {
    console.error("Error deploying contract:", error);
  }
}

contractInstance();