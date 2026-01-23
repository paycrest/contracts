import hre from "hardhat";
import { mockUSDTFixture } from "./mockUSDT.js";
import { configureTokenFeeSettings } from "../utils/utils.manager.js";
import { BigNumber } from "@ethersproject/bignumber";
import { ProxyAdmin__factory } from "../../types/ethers-contracts/factories/@openzeppelin/contracts/proxy/transparent/ProxyAdmin__factory.js";
import { TransparentUpgradeableProxy__factory } from "../../types/ethers-contracts/factories/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy__factory.js";

// Connect to network and get ethers instance (Hardhat v3 pattern)
const { ethers } = await hre.network.connect();

export async function gatewayFixture() {
  const { mockUSDT } = await mockUSDTFixture();
  const [deployer] = await ethers.getSigners();
  
  // Deploy Gateway implementation
  const Gateway = await ethers.getContractFactory("Gateway");
  const gatewayImpl = await Gateway.deploy();
  await gatewayImpl.waitForDeployment();
  
  // Deploy ProxyAdmin using TypeChain factory
  const proxyAdminFactory = new ProxyAdmin__factory(deployer);
  const proxyAdmin = await proxyAdminFactory.deploy();
  await proxyAdmin.waitForDeployment();
  
  // Encode the initialize function call
  const initializeData = Gateway.interface.encodeFunctionData("initialize");
  
  // Deploy TransparentUpgradeableProxy using TypeChain factory
  const proxyFactory = new TransparentUpgradeableProxy__factory(deployer);
  const proxy = await proxyFactory.deploy(
    await gatewayImpl.getAddress(),
    await proxyAdmin.getAddress(),
    initializeData
  );
  await proxy.waitForDeployment();
  
  // Get Gateway instance at proxy address
  const gateway = Gateway.attach(await proxy.getAddress());
  
  console.log("Gateway deployed to:", await gateway.getAddress());

  // First, mark the token as supported
  const token = ethers.encodeBytes32String("token");
  const mockUSDTAddress = await mockUSDT.getAddress();
  await gateway.connect(deployer).settingManagerBool(token, mockUSDTAddress, 1);

  // Then configure token fee settings for mockUSDT
  await configureTokenFeeSettings(gateway, deployer, mockUSDTAddress, {
    senderToProvider: 50000,      // 50% of sender fee goes to provider
    providerToAggregator: 50000, // 50% of provider's share goes to aggregator
    senderToAggregator: 0,       // 0% of sender fee goes to aggregator (FX mode)
    providerToAggregatorFx: 500  // 0.5% of transaction amount provider pays to aggregator (FX mode)
  });

  return { gateway, mockUSDT };
}

