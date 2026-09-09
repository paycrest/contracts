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

```
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
- **P10 Admission**: `lock` reverts on a bad, expired, or foreign-domain `LockAuth` signature, on `msg.sender ≠ locker`, or on `disputeDelay` mismatch; `lockWithPermit` additionally reverts if the permit owner ≠ locker or permit value ≠ amount.
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

Filled in by `scripts/check-otc-traceability.sh` output in PR C2. Until `contracts/OTCGateway.sol` exists the
check is skipped with a warning.

| Property | Test(s) |
|---|---|
| P1–P15 | pending (C2) |
