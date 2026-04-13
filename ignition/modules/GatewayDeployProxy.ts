import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const proxyModule = buildModule("GatewayProxyModule", (m) => {
  const proxyAdminOwner = m.getAccount(0);

  // Deploy the Gateway implementation contract
  const gateway = m.contract("Gateway");

  // Deploy the TransparentUpgradeableProxy
  const proxy = m.contract("TransparentUpgradeableProxy", [
    gateway,
    proxyAdminOwner,
    "0x", // Empty initialization data
  ]);

  // Get the ProxyAdmin address from the AdminChanged event
  const proxyAdminAddress = m.readEventArgument(
    proxy,
    "AdminChanged",
    "newAdmin"
  );

  // Get a contract instance for the ProxyAdmin
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

  return { proxyAdmin, proxy };
});

const gatewayModule = buildModule("GatewayModule", (m) => {
  const { proxy, proxyAdmin } = m.useModule(proxyModule);

  // Create a Gateway contract instance at the proxy address
  const gateway = m.contractAt("Gateway", proxy);

  return { gateway, proxy, proxyAdmin };
});

export default gatewayModule;