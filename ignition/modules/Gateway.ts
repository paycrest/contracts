import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Gateway", (m: { contract: (arg0: string) => any; }) => {
  const Gateway = m.contract("Gateway");

  return { Gateway };
});