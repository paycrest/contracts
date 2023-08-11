const { NETWORKS } = require('../scripts/config.js');
// const { hre } = require('hardhat');

// const { ProxyAdmin__factory } = require('../typechain-types');

const func = async function (hre) {
  const {
    deployments: { deploy, save, get },
    getNamedAccounts,
    network,
  } = hre;

  const waitConfirmations = network.config.chainId !== 421613 ? 2 : 0;

  const { deployer } = await getNamedAccounts();

  const networkId = 421613; // Replace with the desired network ID
  const USDC_ADDRESS = NETWORKS[networkId].USDC_ADDRESS;

  if (USDC_ADDRESS) {
    console.log('skipping deployment for USDC, using:', USDC_ADDRESS);
    await save('USDC', { /*abi: ProxyAdmin__factory.abi,*/ address: USDC_ADDRESS });
  } else {
    await deploy('MockUSDC', {
      contract: 'MockUSDC',
      from: deployer,
      log: true
    });
  }
};

module.exports = func;

func.tags = ['MockUSDC'];
