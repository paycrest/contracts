import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * OTCGateway — immutable, non-upgradeable. No proxy, no ProxyAdmin, no initializer.
 *
 * Deploy with the CREATE2 strategy so the address is identical on every chain (the salt lives in
 * hardhat.config.ts under `ignition.strategyConfig.create2`). That only holds if the constructor arguments are
 * identical per chain too, which is why token whitelisting is NOT part of deployment: token addresses differ per
 * chain and are set afterwards by the owner Safe with `setTokenSupported(token, true)`.
 *
 *   npx hardhat ignition deploy ignition/modules/OTCGateway.ts \
 *     --network baseSepolia --strategy create2 \
 *     --parameters ignition/params/otc-baseSepolia.json
 *
 * Parameters (all required, see ignition/params/*.json):
 *   owner        Safe that can unpause, rotate roles, whitelist tokens, withdraw fees. Never moves locked funds.
 *   pauser       Hot EOA that can only pause (blocks new locks).
 *   authSigner   Aggregator OTC signing key (admits locks; cannot move or freeze funds).
 *   arbiter      Safe that resolves locks stuck in Paying after disputeDelay.
 *   treasury     Receives accrued protocol fees via withdrawFees.
 *   disputeDelay Seconds; bounded [1 day, 30 days] by the contract. Launch value: 259200 (3 days).
 */
export default buildModule("OTCGatewayModule", (m) => {
  const owner = m.getParameter("owner");
  const pauser = m.getParameter("pauser");
  const authSigner = m.getParameter("authSigner");
  const arbiter = m.getParameter("arbiter");
  const treasury = m.getParameter("treasury");
  const disputeDelay = m.getParameter("disputeDelay", 259_200);

  const otcGateway = m.contract("OTCGateway", [owner, pauser, authSigner, arbiter, treasury, disputeDelay]);

  return { otcGateway };
});
