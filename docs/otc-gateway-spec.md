# OTCGateway — specification and verification contract

Status: **spec first, code second.** This document is the source of truth for `contracts/OTCGateway.sol`.
Every numbered property below must have a test whose name carries the property id
(`test_P3_…`, `testFuzz_P3_…`, `invariant_P1_…`, `check_P4_…`); `make otc-traceability` enforces it once the
contract exists. Changing a property here without changing the tests is a review blocker.

## 1. Purpose

A non-custodial escrow for OTC fiat↔USDC trades where the fiat leg is a manual bank transfer with no PSP API.
No Paycrest key can move a counterparty's tokens. The party who would be unpaid if the other side ghosted
locks first, the payee is bound at lock time, and release requires the fiat receiver's signature.

In both directions **the fiat receiver is the locker**:

| Direction | Locker (locks USDC, receives fiat, signs release) | Counterparty (pays fiat, signs `Paying`) | Payee (receives USDC) |
|---|---|---|---|
| Offramp | sender | LP desk wallet | LP settlement address |
| Onramp | LP | sender's registered signing wallet | sender's recipient address (may be an exchange) |

## 2. Roles

| Role | Can | Cannot |
|---|---|---|
| `owner` (Safe) | `unpause`, `setPauser`, `setAuthSigner`, `setArbiter`, `setTreasury`, `setDisputeDelay` (bounded, new locks only), `setTokenSupported`, `withdrawFees` | move or freeze locked funds |
| `pauser` (hot EOA) | `pause` (blocks only new locks) | unpause |
| `authSigner` (aggregator OTC key) | sign `LockAuth` (admit a lock) | move or freeze funds |
| `locker` | full `settle`; `cancel` while `Locked`; co-sign `settlePartial` | exit `Paying` alone |
| `counterparty` | `markPaying`; `waive`; co-sign `settlePartial` | pull funds |
| `payee` | receive | anything |
| `arbiter` (Safe) | `arbitrate(payeeGross)` only in `Paying` after `disputeDelay` | act in `Locked`; act early |
| anyone | `refundExpired` in `Locked` after `deadline` | |

Launch configuration: one internal 2-of-3 Safe is both `owner` and `arbiter`; `disputeDelay` = 3 days.
A separate arbiter Safe with an external signer is required before the liquidity ceiling is raised.

## 3. State machine

```text
None ──lock──▶ Locked ──markPaying──▶ Paying ──settle/settlePartial/arbitrate──▶ Settled
                 │  │                    │
                 │  └──cancel(locker)    ├──waive(counterparty)──▶ Refunded
                 │  └──refundExpired     └──arbitrate(0)──────────▶ Refunded
                 │  └──waive             
                 └──settle(locker)──▶ Settled
```

- `Locked`: locker may `settle` (full) or `cancel`; counterparty may `markPaying` (only while `now ≤ deadline`)
  or `waive`; anyone may `refundExpired` once `now > deadline`.
- `Paying`: locker may `settle` (full); locker+counterparty may `settlePartial`; counterparty may `waive`;
  arbiter may `arbitrate` once `now ≥ payingAt + disputeDelay`.
- `Settled` / `Refunded`: absorbing.

Accounting (one formula everywhere): `fee = payeeGross * feeBps / MAX_BPS`; payee receives `payeeGross - fee`;
locker receives `amount - payeeGross`; `fee` accrues to `accruedFees[token]` and is pulled by `withdrawFees`.
`feeBps` is fixed in the `LockAuth`; no party ever signs a fee.

## 4. Typed data (EIP-712, domain `PaycrestOTCGateway` / `1` / chainId / contract)

| Struct | Fields | Signer |
|---|---|---|
| `LockAuth` | `orderId, token, locker, payee, counterparty, amount, deadline, feeBps, disputeDelay, quoteHash, validUntil` | `authSigner` |
| `Paying` | `orderId, payee, amount, quoteHash` | `counterparty` |
| `Release` | `orderId, payee, amount, quoteHash` | `locker` |
| `ReleasePartial` | `orderId, payee, payeeGross, quoteHash` | `locker` **and** `counterparty` |
| `Waive` | `orderId` | `counterparty` |
| `Cancel` | `orderId` | `locker` |

Display fields (`payee`, `amount`, `quoteHash`) are checked against the stored lock so wallets show the real
terms and a signature cannot be replayed on different terms. Signatures are verified with OpenZeppelin
`SignatureChecker` (EOA and ERC-1271). Every action is also directly callable by its signer without a signature.

## 5. Formal properties

- **P1 Solvency**: for every token, `balanceOf(this) ≥ Σ amount over locks in Locked|Paying + accruedFees[token]`.
- **P2 Destination**: every outgoing transfer targets `lock.payee`, `lock.locker`, or (via `withdrawFees` only, bounded by `accruedFees`) `treasury`.
- **P3 Fee exactness**: `accruedFees` grows by exactly `payeeGross * feeBps / MAX_BPS` per settlement, `feeBps` fixed at lock; no party can change it.
- **P4 Settle authority**: the payee receives tokens only via (a) locker full `settle`, (b) locker+counterparty `settlePartial`, or (c) arbiter in `Paying` after `disputeDelay`. Any other caller or signature combination reverts.
- **P5 Paying is sticky for the locker**: from `Paying`, the locker alone can only full-settle; tokens return to the locker only via counterparty `waive`, co-signed partial, or arbiter after delay. Only `counterparty` can enter `Paying`.
- **P6 Locker liveness**: in `Locked`, `cancel` always succeeds for the locker (even paused, even with a de-whitelisted token); after `deadline`, `refundExpired` succeeds for anyone; `markPaying` after `deadline` reverts.
- **P7 Terminal absorbing**: `Settled` and `Refunded` never transition; no further transfers for that orderId.
- **P8 Pause/whitelist scope**: `paused` or a de-whitelisted token blocks only `lock`/`lockWithPermit`; only `owner` can unpause.
- **P9 Uniqueness**: an orderId locks at most once, ever.
- **P10 Admission**: `lock` reverts on a bad, expired, or foreign-domain `LockAuth` signature, on `msg.sender ≠ locker`, on `disputeDelay` mismatch, or when `payee` or `counterparty` equals `locker` (a counterparty that is also the locker could partial-settle alone); `lockWithPermit` submitted by anyone other than the locker succeeds only if the locker's permit for exactly `amount` was consumed in that call (a standing allowance is never usable by a third party).
- **P11 Owner powerlessness**: no owner function changes any lock's fields or moves locked tokens; `disputeDelay` and `feeBps` are per-lock and immutable after lock.
- **P12 Conservation**: `(payeeGross - fee) + fee + (amount - payeeGross) == amount` on every settle, settlePartial, and arbitrate.
- **P13 Reentrancy**: a malicious token or receiver cannot re-enter any fund-moving function.
- **P14 Signature domain**: a signature valid for one action/orderId is invalid for any other action, orderId, chain, contract, or set of display fields.
- **P15 Settle never depends on treasury**: `settle`, `settlePartial`, and `arbitrate` make no external call to `treasury`.

## 6. Threat model (what is and is not defended)

| Threat | Outcome |
|---|---|
| Stolen aggregator / authSigner key | Can admit new locks only; cannot move or freeze funds (P4, P5, P11) |
| Compromised relay / aggregator downtime | Every action is directly callable by its signer (liveness never depends on Paycrest) |
| Counterparty marks `Paying` and never pays | Locker funds frozen until `payingAt + disputeDelay`; arbiter refunds; counterparty is allow-listed and capped |
| Locker receives fiat and never releases | Arbiter settles to payee after `disputeDelay` on bank evidence |
| Locker cancels while a wire is in flight | Impossible if the payer marked `Paying` first (`cancel` only in `Locked`); UI/API reveal wire details only after `Paying` |
| Phishing "sign to confirm receipt" | Typed data displays payee/amount/quoteHash; contract checks them (P14) |
| Blacklisted payee (USDC) | `settle` reverts; arbiter can refund the locker (`payeeGross = 0`) after the delay |
| Blacklisted locker in `Locked` | Refund reverts until un-blacklisted; no third destination by design (accepted residual) |
| Reverting / blacklisted treasury | Cannot block settlement (P15); fees accrue and are pulled |
| Malicious owner | Immutable contract; owner has no fund powers (P11); can only stop new locks |
| Compromised authSigner + someone holding a standing token allowance | Cannot pull that person's tokens: `lock` requires `msg.sender == locker`, `lockWithPermit` by a third party requires the locker's own permit (P10) |
| Paycrest ops + arbiter Safe collusion | Can misdirect a lock to the bound counterparty after a public delay, never to Paycrest beyond `feeBps`. Mitigated organizationally (external arbiter signer before ceiling is raised). |

## 7. Verification method

| Layer | Tool | What it proves |
|---|---|---|
| Unit + fuzz | Foundry (`test/foundry/OTCGateway.t.sol`) | Each property on concrete and random inputs |
| Invariants | Foundry handler suite (`OTCGateway.invariants.t.sol`) | P1, P2, P7, P9, P12 across random call sequences |
| Bounded symbolic | Halmos (`OTCGateway.halmos.t.sol`, `check_*`) | P4, P5, P6, P8, P10, P14 for all callers/inputs within bounds |
| Static | Slither (`slither.config.json`, fail on medium+) | Known bug classes |
| Coverage | `forge coverage` gate | 100% lines and branches on `OTCGateway.sol` |
| Cross-language | `OTCGateway.vectors.t.sol` → `test/vectors/otc-eip712.json` | Go and Solidity produce identical EIP-712 digests |
| Mutation (report only) | gambit | The tests kill mutants |

"Formally verified" here means bounded symbolic proofs per function plus high-run invariants. There is no
Certora spec in v1. Candidates if a licence is added later: P1, P2, P4, P5, P7.

## 8. Traceability

Enforced by `scripts/check-otc-traceability.sh` (a property with no test whose name carries its id fails the gate).

| Property | Unit / fuzz (`OTCGateway.t.sol`) | Invariant (`OTCGateway.invariants.t.sol`) | Symbolic (`OTCGateway.halmos.t.sol`) |
|---|---|---|---|
| P1 | `test_P1_solvencyHoldsAcrossMixedOutcomes` | `invariant_P1_solvency` | |
| P2 | `test_P2_withdrawFeesOnlyToTreasuryByTreasuryOrOwner` | `invariant_P2_destination` | |
| P3 | `testFuzz_P3_feeExactness` | | |
| P4 | `test_P4_*` (7 tests: locker/co-signed/arbiter paths, ERC-1271, blacklisted payee/locker) | | `check_P4_settleNoSigOnlyLocker`, `check_P4_settleSigOnlyLocker`, `check_P4_arbitrateOnlyArbiterAfterDelay`, `check_P4_settlePartialNeedsBothParties` |
| P5 | `test_P5_onlyCounterpartyEntersPaying`, `test_P5_lockerCannotExitPayingAlone`, `test_P5_tokensReturnFromPayingOnlyViaWaiveCoSignedPartialOrArbiter` | | `check_P5_onlyCounterpartyMarksPaying`, `check_P5_lockerCannotExitPaying`, `check_P5_waiveOnlyCounterparty` |
| P6 | `test_P6_lockerCanAlwaysCancelWhileLocked`, `test_P6_refundExpiredByAnyoneAfterDeadlineAndNotBefore`, `test_P6_waiveWorksFromLocked` | | `check_P6_lockerCanAlwaysCancelWhileLocked`, `check_P6_refundExpiredIffPastDeadline`, `check_P6_noPayingAfterDeadline` |
| P7 | `test_P7_terminalStatesAreAbsorbing` | `invariant_P7_terminalAbsorbing` | |
| P8 | `test_P8_pauseAndDewhitelistBlockOnlyNewLocks` | | `check_P8_pauseBlocksOnlyLock` |
| P9 | `test_P9_orderIdLocksAtMostOnceEver` | `invariant_P9_uniqueness` | |
| P10 | `test_P10_lockRejectsBadAdmission`, `test_P10_lockRejectsForeignDomainSignature`, `test_P10_lockRejectsFeeOnTransferToken`, `testFuzz_P10_lockWithPermitIsRelayableOnlyForTheLockersOwnPermit` | | `check_P10_lockNeedsAuthSignerAndLocker` |
| P11 | `test_P11_ownerCannotTouchAnExistingLock`, `test_P11_setterAccessControlAndBounds` | | |
| P12 | `testFuzz_P12_conservation` | `invariant_P12_conservation` | |
| P13 | `test_P13_reentrancyIntoFundMovingFunctionsIsBlocked` | | |
| P14 | `test_P14_signaturesAreBoundToActionOrderAndTerms` | | `check_P14_releaseIsBoundToOrder`, `check_P14_actionsAreDistinct` |
| P15 | `test_P15_settlementNeverDependsOnTreasury` | | |

Cross-language: `OTCGateway.vectors.t.sol` proves local (test-side) EIP-712 hashing equals the contract's `hash*`
views and writes `test/vectors/otc-eip712.json` for the Go encoder test.

## 9. Halmos modelling notes (why the symbolic suite makes these assumptions)

Halmos models `vm.sign`/`ecrecover`/`vm.addr` with uninterpreted functions. Three assumptions are added in the
symbolic suite; each is true of real ECDSA and none weakens a property:

- **Low-s and `v == 27`.** OpenZeppelin ECDSA rejects high-s; Foundry's real signer always emits low-s. `v` is
  pinned to one representative because Halmos forks on it inside `ecrecover`, which would give `setUp` two
  successful paths (Halmos requires exactly one). The suite never runs under Forge.
- **`vm.addr(pk) != 0`.** No real key maps to the zero address; without it Halmos takes OpenZeppelin's ERC-1271
  fallback for a "recovered zero address" and reports a spurious failure.
- **Existential unforgeability (P14 only).** A signature over digest A, evaluated under a different digest B, is
  assumed to recover to none of the parties. The assumption covers only the foreign digest, so a contract that
  checked the wrong digest for an action would still be caught.

Toolchain notes: Foundry's `dynamic_test_linking` must be off (it rewrites `new X()` into a `deployCode` cheatcode
Halmos does not support), and Halmos needs artifacts built with `--ast` (`make otc-halmos` forces such a build
because Foundry's cache does not key on that flag).
