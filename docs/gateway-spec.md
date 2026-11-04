# Gateway and GatewaySettingManager — specification and verification contract

Status: source of truth for `contracts/Gateway.sol` and `contracts/GatewaySettingManager.sol` as they are on
`main` and deployed (KAN-946). Every numbered property below has a test whose name carries the property id
(`test_P3_…`, `testFuzz_P3_…`, `invariant_P1_…`, `check_P4_…`) in `test/foundry/Gateway*.t.sol`;
`make gw-traceability` enforces it. Changing a property here without changing the tests is a review blocker.

These contracts are live behind Transparent proxies on every supported EVM network. This suite verifies the
code as it is; it does not change it. A property the code violates is listed under §6, with a test that fails
today and is kept out of the gate until the fix lands.

## 1. Purpose

The retail order escrow of the Paycrest protocol.

- **Offramp** (`createOrder` → `settleOut` / `refund`): a sender locks `amount + senderFee` of a supported token.
  The aggregator settles the order to one or more liquidity providers in percentage splits, or refunds it.
- **Onramp** (`settleIn`): a provider pays `amount + senderFee` in and the Gateway forwards it at once: the
  principal (less the treasury fee) to the recipient, the treasury fee (less the provider's rebate) to the
  treasury, the rebate back to the provider, and the sender fee split between the sender-fee recipient and the
  treasury. Nothing stays in the Gateway.

## 2. Roles

| Role | Can | Cannot |
|---|---|---|
| owner (`Ownable2Step`) | support/unsupport tokens; set treasury and aggregator; set per-token fee settings; pause/unpause; transfer ownership (two-step) | settle or refund orders |
| aggregator | `settleOut` and `refund` open orders | create or change settings |
| anyone | `createOrder` (supported token, not paused); `settleIn` (supported token, not paused) | settle or refund an order |
| treasury | receives fees | — |

## 3. Fee model

`MAX_BPS = 100_000` (100%). Per token, `senderToTreasury` (share of the sender fee) and `providerToTreasury`
(share of the principal), each `≤ MAX_BPS`.

| Flow | Treasury fee | Rebate | Paid out |
|---|---|---|---|
| `settleOut` split of `p` (of the order's remaining `c` BPS) | `t = ⌊g·providerToTreasury/MAX⌋`, `g = ⌊remaining·p/c⌋` (`g = remaining` on the last split) | `r = ⌊t·rebate/MAX⌋` to the provider | provider `g − t + r`, treasury `t − r` |
| `settleOut` last split | — | — | sender fee: recipient `f − ⌊f·senderToTreasury/MAX⌋`, treasury the rest |
| `settleIn` | `t = ⌊amount·providerToTreasury/MAX⌋` | `r = ⌊t·rebate/MAX⌋` to `msg.sender` | recipient `amount − t`, treasury `t − r`, sender fee split as above |
| `refund(fee)` | `fee ≤ order.protocolFee` (the fee recorded at creation) | — | treasury `fee`, refund address `remaining − fee + senderFee` |

Fee settings are read when money moves (settlement time), not when the order was created; `order.protocolFee`
(computed at creation) only caps the refund fee.

## 4. Formal properties

- **P1 Owner-only settings.** `settingManagerBool`, `updateProtocolAddress`, `setTokenFeeSettings`, `pause` and
  `unpause` revert for every caller but the owner. Ownership moves only in two steps (`transferOwnership` then
  `acceptOwnership` by the pending owner).
- **P2 Aggregator-only settlement.** `settleOut` and `refund` revert for every caller but the aggregator.
- **P3 Initialization.** The implementation cannot be initialized; the proxy's `initialize` runs once and sets
  `MAX_BPS = 100_000`, the owner to the initializer, unpaused.
- **P4 Order creation.** `createOrder` pulls exactly `amount + senderFee` from the caller and records the order
  (sender, token, amount, sender fee and recipient, refund address, `currentBPS = MAX_BPS`,
  `protocolFee = ⌊amount·providerToTreasury/MAX⌋`). It reverts for an unsupported token, a zero amount, a zero
  refund address, a sender fee without a recipient, or an empty message hash.
- **P5 Order ids.** An order created by `sender` as its `n`-th order has id `keccak256(abi.encode(sender, n,
  chainid))`; a sender's nonce rises by exactly one per order, so `createOrder` ids never repeat. `createOrder`
  never overwrites an existing record: if the id it computes already holds an order, it reverts and the record,
  the sender's funds and the nonce are unchanged.
- **P6 Full settlement pays exactly.** Over any sequence of `settleOut` splits that settles an order, the
  provider(s) and treasury together receive exactly the order amount, the sender fee is paid exactly once (on
  the last split), and the order ends fulfilled with nothing left.
- **P7 Split math.** Each `settleOut` split pays exactly the amounts in §3: the provider and treasury together
  receive the split's gross `g`, the rebate never exceeds the treasury fee, and the order's remaining amount
  drops by exactly `g`. A rebate above `MAX_BPS` reverts.
- **P8 At most once.** A fulfilled order cannot be settled or refunded again; a refunded order cannot be settled
  or refunded again; a split of 0 or above the order's remaining BPS reverts; an unknown order id cannot be
  settled or refunded.
- **P9 Refund.** `refund(fee)` pays the treasury `fee` and the refund address `remaining − fee + senderFee`
  (exactly what the order still holds), marks the order refunded, and reverts when `fee > protocolFee`.
- **P10 settleIn passes everything through.** `settleIn` pulls `amount + senderFee` and pays out exactly that
  much (recipient, treasury, rebate to the caller, sender fee split): the Gateway's balance is unchanged. The
  order is booked fulfilled under the given id; an id already in use reverts; a rebate above `MAX_BPS` reverts.
- **P11 Sender fee split.** The sender-fee recipient receives `f − ⌊f·senderToTreasury/MAX⌋` and the treasury
  the rest; together exactly `f`.
- **P12 Token conservation.** At all times, for each token, the Gateway's balance equals the sum over open
  (neither fulfilled nor refunded) orders of `remaining amount + senderFee`. No flow leaks or creates tokens.
- **P13 Pause.** While paused, `createOrder` and `settleIn` revert; `settleOut` and `refund` of existing orders
  still work, so a pause stops new money in without trapping open orders.
- **P14 Setting bounds.** Fee settings above `MAX_BPS` or for an unsupported token revert; zero addresses and a
  token status other than 1 or 2 revert; setting the treasury or aggregator to its current value reverts; an
  unknown setting key changes nothing.
- **P15 Delisting does not strand orders.** After a token is unsupported (status 2), new orders and `settleIn`
  in it revert, but its open orders can still be settled or refunded.
- **P16 Storage layout.** The layout matches every current implementation recorded in `.openzeppelin/*.json`:
  every deployed variable keeps its slot, offset and type, `IGateway.Order` keeps its members, and new variables
  only consume the start of a `__gap` whose end slot is unchanged (`_tokenFeeSettings` took the first slot of the
  `GatewaySettingManager` gap). `make gw-storage-layout` checks every recorded implementation (the Tron manifests
  record no slots, so it lays their variables out as solc does) and that no two variables share bytes; the test
  pins the slots. The pre-fee-model implementations recorded before the current layout are listed as superseded
  and reported, not gated, and `arbitrum-sepolia.json` is an older testnet proxy this code is not compatible with,
  reported as an exception: never upgrade it to this code. The manifests do not say which implementation each
  proxy points at; `GW_LAYOUT_RPC="base.json=https://… …" make gw-storage-layout` reads each proxy's EIP-1967 slot
  and fails unless it points at a recorded, compatible implementation. Run it before any upgrade.

## 5. Assumptions

- Supported tokens are standard ERC-20s (no fee-on-transfer, rebasing or transfer hooks); the owner only
  supports such tokens. P12 does not hold for a token that charges on transfer.
- The owner and aggregator keys are honest; P1/P2 only say no one else holds their powers.
- `settleOut` trusts the aggregator's `_liquidityProvider` and split; the contract only guarantees the amounts.
- Halmos bounds amounts to `2^96` and proves P6 as its inductive step: any split, from any remaining amount and
  `currentBPS`, conserves tokens exactly and closes the order only when it takes the rest. Two facts the
  solver times out on (nonlinear 256-bit arithmetic) are left to fuzzing and the invariants rather than proved:
  `amount·c/c = amount` on the last split (so nothing is left), and `protocolFee ≤ amount` (P4), which the
  refund check assumes.

## 6. Known violations (not gated)

None listed. A finding that affects deployed contracts is handled privately under the security policy and
recorded here once the fix is deployed.

## 7. Static analysis triage

`make gw-slither` runs Slither on both files with `slither.gateway.json` and fails on any medium or high finding
that is not in `slither.gateway.db.json`. That database holds exactly the six findings below, by Slither's
finding id, which includes the source lines: if the flagged code changes, the finding reappears and fails the gate.
None is a defect; each is pinned by a property.

| Finding | Where | Why it is accepted |
|---|---|---|
| divide-before-multiply (×2) | `settleOut`: gross → treasury fee → rebate | The flooring at each step is the fee model in §3, and the same as `settleIn` and the aggregator. P6/P7 prove the provider and treasury still receive exactly the gross and that the order ends with nothing left; rounding only moves dust between treasury and provider. |
| reentrancy-no-eth | `refund` writes `isRefunded`/`currentBPS` after the treasury transfer | `refund` is aggregator-only (P2), and supported tokens are standard ERC-20s with no transfer hooks (§5), so nothing can re-enter between the transfer and the write. Even so, a re-entrant `refund` would need the aggregator as caller, and `settleOut` / `settleIn` cannot touch the order mid-refund in a way that pays twice (P8, P12). |
| uninitialized-local (×3) | `updated` in `updateProtocolAddress`, `_protocolFee` in `createOrder`, `rebateAmount` in `_bookSettleInAndPayFees` | Each relies on Solidity's zero default on purpose: no change for an unknown key (P14), no protocol fee without fee settings (P4), no rebate without a treasury fee (P10). |
