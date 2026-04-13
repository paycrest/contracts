import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ProviderBatchCallAndSponsor", (m: { contract: (arg0: string) => any; }) => {
  const ProviderBatchCallAndSponsor = m.contract("ProviderBatchCallAndSponsor");

  return { ProviderBatchCallAndSponsor };
});