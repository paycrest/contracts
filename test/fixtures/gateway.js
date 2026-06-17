import hre from "hardhat";
import { ethers } from "../setup.js";
import { mockUSDTFixture } from "./mockUSDT.js";
import { configureTokenFeeSettings } from "../utils/utils.manager.js";

const { artifacts } = hre;

async function gatewayFixture() {
  const { mockUSDT } = await mockUSDTFixture();
  const [deployer] = await ethers.getSigners();
  
  // Deploy Gateway implementation
  const Gateway = await ethers.getContractFactory("Gateway");
  const gatewayImpl = await Gateway.deploy();
  await gatewayImpl.waitForDeployment();
  
  // Load OpenZeppelin artifacts and deploy ProxyAdmin
  const ProxyAdminArtifact = await artifacts.readArtifact("@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin");
  const ProxyAdmin = await ethers.getContractFactoryFromArtifact(ProxyAdminArtifact);
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  
  // Encode initialize call
  const initData = Gateway.interface.encodeFunctionData("initialize", []);
  
  // Load TransparentUpgradeableProxy artifact and deploy
  const TransparentProxyArtifact = await artifacts.readArtifact("@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy");
  const TransparentProxy = await ethers.getContractFactoryFromArtifact(TransparentProxyArtifact);
  const proxy = await TransparentProxy.deploy(
    await gatewayImpl.getAddress(),
    await proxyAdmin.getAddress(),
    initData
  );
  await proxy.waitForDeployment();
  
  // Get Gateway instance at proxy address
  const gateway = Gateway.attach(await proxy.getAddress());
  
  console.log("Gateway deployed to:", await gateway.getAddress());

  // First, mark the token as supported
  const token = ethers.encodeBytes32String("token");
  const mockUSDTAddress = await mockUSDT.getAddress();
  await gateway.connect(deployer).settingManagerBool(token, mockUSDTAddress, 1n);

  // Then configure token fee settings for mockUSDT
  await configureTokenFeeSettings(gateway, deployer, mockUSDTAddress, {
    senderToTreasury: 0n,
    providerToTreasury: 500n
  });

  return { gateway, mockUSDT };
}

export { gatewayFixture };
