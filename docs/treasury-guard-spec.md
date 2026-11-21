# TreasuryGuard and TreasurySetup — specification and verification contract

Status: source of truth for `contracts/TreasuryGuard.sol` and `contracts/TreasurySetup.sol` (KAN-1042, for
KAN-925). Every numbered property below has a test whose name carries the property id (`test_P3_…`,
`testFuzz_P3_…`, `invariant_P1_…`, `check_P4_…`); `make treasury-traceability` enforces it. Changing a property
here without changing the tests is a review blocker.

## 1. Purpose

A Paycrest company treasury is a Safe v1.4.1 whose owners are the business's member passkeys plus one Paycrest
co-signer key, threshold 2. Two rules must hold on-chain:

1. **Paycrest's policy can't be skipped**: no transaction on the normal path goes through without the co-signer,
   and a co-signature stops working at the deadline the co-signer gave it.
2. **Paycrest can't act alone, and the business never depends on Paycrest**: the co-signer can't move funds by
   itself, and the business's admins can always recover the treasury through a timelock, without Paycrest
   (as long as their own recovery Safe stays usable: it is theirs to configure, §4).

`TreasuryGuard` enforces rule 1 and the first half of rule 2. `TreasurySetup` wires the recovery path (a Zodiac
Delay 1.0.0 timelock driven by a recovery Safe of the business's admins) and installs the guard, in the
treasury's own `Safe.setup`.

The tests run against the exact deployed bytecode: Safe, SafeL2, SafeProxyFactory, CompatibilityFallbackHandler
and MultiSendCallOnly from the `@safe-global/safe-contracts@1.4.1` npm artifacts, and Zodiac Delay 1.0.0 from
Zodiac's mastercopy record (`test/foundry/fixtures/treasury/`). The Safe fixtures' runtime code hashes equal the
canonical deployments in safe-deployments (checked by a test).

## 2. Roles

| Role | Can | Cannot |
|---|---|---|
| Member (passkey owner) | sign treasury transactions | execute without the co-signer |
| Paycrest co-signer (EOA owner) | co-sign transactions its off-chain policy approves (KAN-1037, KAN-1038) | execute alone; recover; touch the recovery Safe |
| Keeper / anyone | submit a fully signed `execTransaction` before its deadline; run a recovery transaction after its cooldown | change a signed transaction; extend a co-signature's deadline; skip the cooldown |
| Recovery Safe (the admins, majority threshold) | queue any treasury transaction on the timelock | run it before the cooldown; stop the treasury cancelling it |
| Treasury itself | register / rotate its co-signer; cancel queued recovery (`setTxNonce`); manage the recovery Safe's owners (it is a module there) | — |

Neither contract has an owner, admin, upgrade path or pause. `TreasuryGuard` is one deployment for every treasury;
`TreasurySetup` holds no state and only runs by delegatecall.

## 3. Formal properties

### TreasuryGuard

- **P1 Co-signer required**: on a Safe that registered a co-signer, `execTransaction` succeeds only if one of the signatures Safe counted (the first `threshold`) is the co-signer's (and its deadline attestation holds, P15 and P16), in any encoding Safe accepts: ECDSA over the hash (`v ∈ {27, 28}`), eth_sign (`v > 30`), or approved hash (`v == 1`, by `approveHash` or by the co-signer submitting). Member signatures alone, however many, revert `MissingCosignerSignature`.
- **P2 Never alone**: if the Safe's threshold is below 2, every `execTransaction` reverts `ThresholdTooLow`, so the co-signer can never be the only signature. With a threshold of 2 or more, Safe's strictly-ascending owner rule means at least one owner other than the co-signer signed.
- **P3 Counted signatures only**: signatures after the first `threshold` (which Safe does not check) never satisfy the guard, so an unchecked co-signer entry appended to member signatures is refused.
- **P4 Same transaction**: the hash the guard checks the co-signer's signature against is exactly the Safe's own `getTransactionHash` for the transaction being executed (its nonce, fields, chain and Safe). A co-signer signature for any other transaction does not count.
- **P5 Fail closed**: a Safe that set the guard but registered no co-signer can't execute anything on the normal path (`CosignerNotSet`); a caller that is not a Safe gets no pass (`TransactionHashUnavailable` or a revert).
- **P6 Registration**: `setCosigner(c)` registers `c` for the calling Safe only; it reverts for the zero address (`ZeroCosigner`) or a non-owner (`CosignerNotOwner`), leaves every other Safe's entry untouched, and emits `CosignerSet(safe, c)`.
- **P7 Recovery is never blocked**: module transactions (the timelock) execute without calling the guard, so recovery can move funds, remove the guard and replace the co-signer without Paycrest.
- **P8 Interface**: `supportsInterface` is true for Safe's `Guard` interface id (so `Safe.setGuard` accepts it) and for ERC-165, false otherwise.
- **P9 No side effects**: `checkTransaction` and `checkAfterExecution` write no storage and never block a transaction for any reason other than P1, P2, P5, P15, P16 and P17; `setCosigner` is the only state change. For a treasury without a fallback handler, `checkAfterExecution` passes whatever the transaction's outcome.
- **P10 Passkey owners**: contract-signature owners (`v == 0`, how Safe's WebAuthn signers sign) count as members; they never stand in for the co-signer unless the co-signer itself is that contract. A contract co-signer can't make the ECDSA attestation (P16), so it keeps the normal path closed: the co-signer must be an EOA.
- **P15 Co-signatures expire on-chain**: `execTransaction` reverts `CosignatureExpired(deadline, timestamp)` once `block.timestamp > deadline`, where `deadline` is the one the co-signer attested (P16). A transaction runs at any time up to and including its deadline. So a co-signature that expired, or that the co-signer service replaced at the same nonce after it expired, can never run, whoever holds it.
- **P16 Deadline attestation**: the last 97 bytes of `signatures` are `uint256 deadline ‖ r ‖ s ‖ v`, the co-signer's ECDSA signature over `deadlineDigest(safeTxHash, deadline) = keccak256(abi.encode(keccak256("TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)"), safeTxHash, deadline))`, where `safeTxHash` is the hash of P4 (so it commits to the chain, the Safe, the nonce and every field). Fewer than `threshold * 65 + 97` bytes revert `DeadlineAttestationMissing`; an attestation that does not recover to the registered co-signer for this transaction and this deadline (a member's, a rotated-out co-signer's, another transaction's, or the deadline word changed) reverts `InvalidDeadlineAttestation`. Safe ignores bytes past the signatures it reads, so the attestation does not affect Safe's own check; contract signatures' dynamic parts stay at the offsets their static parts name, before the attestation.
- **P17 No fallback handler**: a treasury has no fallback handler, so it answers no ERC-1271 `isValidSignature` (Safe's `CompatibilityFallbackHandler` would accept `threshold` owner signatures there without consulting the guard, so two members could sign token permits or off-chain orders without the co-signer). `setupTreasury` reverts `FallbackHandlerSet(handler)` if the treasury's `Safe.setup` set one, and `checkAfterExecution` reverts `FallbackHandlerSet(safe, handler)` after any normal-path transaction that leaves one set, whatever the handler (Safe's, the guard itself, anything else) and even if the same transaction removes the guard (Safe calls the hook on the guard it read before execution). Recovery (a module transaction) can set one; the admins can do anything through recovery anyway (P7).

### TreasurySetup

- **P11 Wiring**: a treasury created through `SafeProxyFactory` with `setupTreasury` ends up with: `TreasuryGuard` as its guard and the configured co-signer registered; a Delay timelock enabled as its module, owned by the treasury with the treasury as avatar and target and the configured cooldown and expiration; a recovery Safe of the configured admins and threshold, enabled as the timelock's only module and with the treasury enabled as its module. A treasury threshold below 2 reverts `TreasuryThresholdTooLow`; calling the helper other than by delegatecall reverts `OnlyDelegateCall`. The recovery Safe's address is public and Safe's factory does not salt with the caller, so anyone can deploy it before the treasury; setup then reuses it (CREATE2 means only the factory, with exactly this initializer and singleton, can have put it there) if it still has the treasury enabled as a module, and reverts `RecoveryNotWired` otherwise, so deploying it first can't block the treasury. CREATE2 fixes the recovery Safe's initial configuration only: before the treasury exists its admins (and only they) may already have changed its owners, threshold or guard. That is accepted, because the recovery Safe is the admins' own and they can make the same changes at any time after setup; the trust assumption is the same as for any recovery change (P12).
- **P12 Timelocked recovery**: the recovery Safe's admins can queue a treasury transaction; it can't run before the cooldown, runs after it (by anyone), expires after the expiration window, and the treasury's normal path (a member plus the co-signer) can cancel it with `setTxNonce` while it waits.
- **P13 Deterministic addresses**: the treasury, timelock and recovery Safe addresses depend only on the initializer and salt, are the same for every chain id, and are predictable before deployment. The Safe singleton is part of the address, so the treasury must use the same singleton (SafeL2) on every network.
- **P14 Co-signer rotation**: one co-signed transaction (a member plus the current co-signer, through MultiSendCallOnly: `swapOwner` then `setCosigner`) replaces the co-signer without recovery; afterwards the old key no longer counts and the new one does.
- **P18 Recovery bounds and a checked timelock**: `setupTreasury` reverts `RecoveryCooldownTooShort` for a cooldown below `MIN_RECOVERY_COOLDOWN` (24 hours), `RecoveryExpirationRequired` for an expiration of 0 (a queued transaction that keeps failing would block the queue for good; Delay itself refuses 1 to 59 seconds), `RecoveryThresholdNotMajority` unless `2 * recoveryThreshold > recoveryOwners.length`, and `NoDelayMastercopy` if the Delay mastercopy has no code (a clone of nothing accepts every call and anyone could initialise it later). After cloning, it checks that the timelock reports the treasury as owner, avatar and target, the configured cooldown and expiration, and the recovery Safe as an enabled module, else `DelayNotConfigured`. These bound the treasury at creation only: the treasury (a member plus the co-signer) owns the timelock and can change its settings later, which the co-signer policy must cover (§4).

## 4. Non-goals and what the co-signer policy must cover

- The guard does not restrict what a co-signed transaction does. The co-signer service (KAN-1037) must refuse: delegatecalls other than to MultiSendCallOnly; changes to owners, threshold, modules, guard, fallback handler or the timelock's settings unless the approval policy (KAN-1038) explicitly covers them; lowering the threshold below 2 (it would freeze the normal path, P2).
- Removing the co-signer as an owner without re-registering one freezes the normal path (P5); recovery still works (P7).
- `checkAfterExecution` checks only P17.
- The deadline is checked against `block.timestamp`, which can trail wall-clock time by a few seconds. The
  co-signer service must not treat a co-signature as dead (and co-sign a replacement at the same nonce) until
  its deadline has passed by a safety margin.
- The attestation is a separate signature, not part of Safe's: the co-signer key also signs Safe transaction
  hashes directly, and no `deadlineDigest` can equal a Safe transaction hash (different preimages: Safe's start
  with `0x1901`).
- The recovery Safe is created without a guard: it must work without Paycrest. It belongs to the admins, who can
  change its owners or threshold or install a guard (before setup, if they deployed it first, P11, or at any time
  after); a guard they install can block their own recovery path. Recovery depends on that configuration.
- Recovery protects the business from Paycrest, not from Paycrest plus a member: the normal path (a member plus
  the co-signer) can cancel queued recovery, change the timelock's settings, or change the recovery Safe's owners.
  The co-signer policy must refuse those unless the business's admins approved them.
- The co-signer key must sign only Safe transaction hashes and deadline digests it computed itself, never a raw
  hash it was handed: a signature over an arbitrary hash could be replayed as an owner signature elsewhere.
- The policy must check the gas-refund fields (`safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, `refundReceiver`):
  a refund is a payment out of the treasury.
- **Same address on every chain, bound to the first configuration** (P13): anyone can deploy a treasury's
  original initializer on a chain where it isn't deployed yet, and there it has the original owners, co-signer
  and recovery admins, whatever has changed on other chains since. The treasury service (KAN-925) must deploy a
  treasury on every supported network when it is created; on a network added later, it must deploy it there and
  bring it up to date (the same owner, co-signer and recovery changes, co-signed there) before showing the
  address for that network. An address is never shown, or used for deposits, on a network where the treasury is
  not deployed and current.
- **Setup checks only what it can see**: `setupTreasury` checks the handler slot and the timelock's getters at
  the moment it runs. It can't see what an initializer does around it (for example a MultiSend that calls it and
  then changes the guard, modules or handler), Safe's `payment` fields (with `paymentReceiver = 0`, `Safe.setup`
  pays `tx.origin`, so whoever deploys first collects it), or whether `c.guard`, `c.delayMastercopy` and the Safe
  addresses are the canonical ones (a look-alike timelock passes the getter checks). Only the initializer's
  author can choose these, since CREATE2 binds the address to it. The treasury service and the dashboard must
  check that an initializer is exactly `setup(owners, threshold, TreasurySetup, setupTreasury(config), 0, 0, 0, 0)`
  with the canonical guard, setup helper, Delay mastercopy, Safe factory, singleton and handler before using or
  showing its address.
- **The co-signer registration is policy too**: `setCosigner` accepts any owner (P6), members included. A
  co-signed `setCosigner(member)` would let two members act alone from then on. The policy must refuse any call
  to `TreasuryGuard.setCosigner`, directly or inside a MultiSend, unless the new key is a Paycrest co-signer key
  (the P14 rotation).
- **The recovery Safe is reachable from the normal path**: the treasury is a module of the recovery Safe (so it
  can manage the admins), which means a co-signed `recovery.execTransactionFromModule(...)` can make the
  recovery Safe do anything, including queue an unguarded treasury transaction on the timelock or delegatecall.
  The policy may only allow the recovery Safe's own owner-management calls (`addOwnerWithThreshold`,
  `removeOwner`, `swapOwner`, `changeThreshold`) with operation `Call`, and only when the admins approved them.
- The co-signer service in paycrest/aggregator#1338 co-signs only a plain `Call` of ERC-20 `transfer` on a wallet
  asset, with no value and no gas refund, so today it refuses every administrative call above; any wider policy
  (KAN-1038) must keep these rules.
- **Admin clients queue recovery with `execTransactionFromModule`**: in Delay 1.0.0,
  `execTransactionFromModuleReturnData` returns `(false, "")` and queues nothing.
- **Rotation swaps, never adds**: the co-signer is rotated with `swapOwner` (P14). The policy must refuse adding
  a second Paycrest key as an owner: with two Paycrest owners at threshold 2, Paycrest could act alone.
- With no fallback handler (P17) a treasury can't receive ERC-721 or ERC-1155 tokens by `safeTransferFrom`
  (the receiver hooks are not answered) and can't sign messages (ERC-1271). Plain ERC-20 and ETH transfers in
  are unaffected.

## 5. Verification

`make treasury-verify` runs: forge build; unit, fuzz and integration tests against the real Safe and Delay
bytecode; the handler invariant suite; 100% line and branch coverage of `contracts/TreasuryGuard.sol` and
`contracts/TreasurySetup.sol`; Halmos bounded symbolic checks (`check_` functions in
`test/foundry/TreasuryGuard.halmos.t.sol`); Slither (fails on medium or high); traceability of this document's
property ids; Hardhat compile parity. CI runs it (`.github/workflows/treasury-verify.yml`) with the pinned
toolchain in `requirements-verify.lock`.
