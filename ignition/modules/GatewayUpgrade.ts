import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { NETWORKS } from "../../scripts/config";


const GatewayUpgradeModule = buildModule("GatewayUpgradeModule", (m) => {
  // Get the chain ID from parameters
  const chainId = m.getParameter("chainId");
  
  if (!chainId) {
    throw new Error(
      "Chain ID parameter is required.\n" +
      "Create a parameters file with: { \"GatewayUpgradeModule\": { \"chainId\": <chainId> } }\n" +
      "Then use: --parameters ignition/parameters/<network>.json"
    );
  }

  // Get the existing proxy contract address from config
  const networkConfig = NETWORKS[chainId as unknown as keyof typeof NETWORKS];
  if (!networkConfig) {
    throw new Error(`Network configuration not found for chainId: ${chainId}`);
  }
  
  const existingProxyAddress = networkConfig.gatewayContract;
  if (!existingProxyAddress) {
    throw new Error(`Gateway contract address not found for chainId: ${chainId}`);
  }

  console.log(`Upgrading Gateway proxy at: ${existingProxyAddress} on chain ${chainId}`);

  // Deploy the new Gateway implementation contract
  const newImplementation = m.contract("Gateway");

  // Get the existing proxy contract
  const proxy = m.contractAt("ITransparentUpgradeableProxy", existingProxyAddress);
  
  // Get the ProxyAdmin address by reading the ERC1967 admin storage slot
  // The admin slot is: bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
  const proxyAdminAddress = m.staticCall(proxy, "admin", [], "getProxyAdmin");

  console.log(`Retrieved ProxyAdmin from proxy contract`);

  // Get the ProxyAdmin contract instance
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

  // Upgrade the proxy to the new implementation
  m.call(proxyAdmin, "upgradeAndCall", [
    existingProxyAddress, 
    newImplementation,
    "0x" // No initialization call needed
  ]);

  console.log(`Upgraded proxy to new implementation`);

  // Get the upgraded gateway instance at the proxy address
  const upgradedGateway = m.contractAt("Gateway", existingProxyAddress);

  return { 
    newImplementation, 
    proxyAdmin,
    upgradedGateway
  };
});

export default GatewayUpgradeModule;