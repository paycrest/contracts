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
   itself, and the business's admins can always recover the treasury through a timelock, without Paycrest.

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
- **P9 No side effects**: `checkTransaction` and `checkAfterExecution` write no storage and never block a transaction for any reason other than P1, P2, P5, P15 and P16; `setCosigner` is the only state change.
- **P10 Passkey owners**: contract-signature owners (`v == 0`, how Safe's WebAuthn signers sign) count as members; they never stand in for the co-signer unless the co-signer itself is that contract. A contract co-signer can't make the ECDSA attestation (P16), so it keeps the normal path closed: the co-signer must be an EOA.
- **P15 Co-signatures expire on-chain**: `execTransaction` reverts `CosignatureExpired(deadline, timestamp)` once `block.timestamp > deadline`, where `deadline` is the one the co-signer attested (P16). A transaction runs at any time up to and including its deadline. So a co-signature that expired, or that the co-signer service replaced at the same nonce after it expired, can never run, whoever holds it.
- **P16 Deadline attestation**: the last 97 bytes of `signatures` are `uint256 deadline ‖ r ‖ s ‖ v`, the co-signer's ECDSA signature over `deadlineDigest(safeTxHash, deadline) = keccak256(abi.encode(keccak256("TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)"), safeTxHash, deadline))`, where `safeTxHash` is the hash of P4 (so it commits to the chain, the Safe, the nonce and every field). Fewer than `threshold * 65 + 97` bytes revert `DeadlineAttestationMissing`; an attestation that does not recover to the registered co-signer for this transaction and this deadline (a member's, a rotated-out co-signer's, another transaction's, or the deadline word changed) reverts `InvalidDeadlineAttestation`. Safe ignores bytes past the signatures it reads, so the attestation does not affect Safe's own check; contract signatures' dynamic parts stay at the offsets their static parts name, before the attestation.

### TreasurySetup

- **P11 Wiring**: a treasury created through `SafeProxyFactory` with `setupTreasury` ends up with: `TreasuryGuard` as its guard and the configured co-signer registered; a Delay timelock enabled as its module, owned by the treasury with the treasury as avatar and target and the configured cooldown and expiration; a recovery Safe of the configured admins and threshold, enabled as the timelock's only module and with the treasury enabled as its module. A treasury threshold below 2 reverts `TreasuryThresholdTooLow`; calling the helper other than by delegatecall reverts `OnlyDelegateCall`.
- **P12 Timelocked recovery**: the recovery Safe's admins can queue a treasury transaction; it can't run before the cooldown, runs after it (by anyone), expires after the expiration window, and the treasury's normal path (a member plus the co-signer) can cancel it with `setTxNonce` while it waits.
- **P13 Deterministic addresses**: the treasury, timelock and recovery Safe addresses depend only on the initializer and salt, are the same for every chain id, and are predictable before deployment. The Safe singleton is part of the address, so the treasury must use the same singleton (SafeL2) on every network.
- **P14 Co-signer rotation**: one co-signed transaction (a member plus the current co-signer, through MultiSendCallOnly: `swapOwner` then `setCosigner`) replaces the co-signer without recovery; afterwards the old key no longer counts and the new one does.

## 4. Non-goals and what the co-signer policy must cover

- The guard does not restrict what a co-signed transaction does. The co-signer service (KAN-1037) must refuse: delegatecalls other than to MultiSendCallOnly; changes to owners, threshold, modules, guard, fallback handler or the timelock's settings unless the approval policy (KAN-1038) explicitly covers them; lowering the threshold below 2 (it would freeze the normal path, P2).
- Removing the co-signer as an owner without re-registering one freezes the normal path (P5); recovery still works (P7).
- `checkAfterExecution` checks nothing.
- The deadline is checked against `block.timestamp`, which can trail wall-clock time by a few seconds. The
  co-signer service must not treat a co-signature as dead (and co-sign a replacement at the same nonce) until
  its deadline has passed by a safety margin.
- The attestation is a separate signature, not part of Safe's: the co-signer key also signs Safe transaction
  hashes directly, and no `deadlineDigest` can equal a Safe transaction hash (different preimages: Safe's start
  with `0x1901`).
- The recovery Safe has no guard by design: it must work without Paycrest.

## 5. Verification

`make treasury-verify` runs: forge build; unit, fuzz and integration tests against the real Safe and Delay
bytecode; the handler invariant suite; 100% line and branch coverage of `contracts/TreasuryGuard.sol` and
`contracts/TreasurySetup.sol`; Halmos bounded symbolic checks (`check_` functions in
`test/foundry/TreasuryGuard.halmos.t.sol`); Slither (fails on medium or high); traceability of this document's
property ids; Hardhat compile parity. CI runs it (`.github/workflows/treasury-verify.yml`) with the pinned
toolchain in `requirements-verify.lock`.
