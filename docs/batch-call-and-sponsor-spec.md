# BatchCallAndSponsor — specification and verification contract

Status: source of truth for `contracts/BatchCallAndSponsor.sol` (KAN-943). Every numbered property below has a
test whose name carries the property id (`test_P3_…`, `testFuzz_P3_…`, `invariant_P1_…`, `check_P4_…`);
`make bcs-traceability` enforces it. Changing a property here without changing the tests is a review blocker.

## 1. Purpose

The EIP-7702 delegate for Paycrest-managed accounts: order receive addresses, provider wallets and Paycrest
Wallets customer wallets. An EOA delegates to this contract; anyone (a sponsor, normally the aggregator) can then
submit a batch of calls the account signed off-chain, paying the gas. It supersedes `ProviderBatchCallAndSponsor`,
whose signature covered only `keccak256(nonce ‖ calls)`: no chain id, no account, no expiry, so a signed batch
could be replayed on another network where the same EOA is delegated at the same nonce, and never expired.

Under EIP-7702 the code runs in the account's context: `address(this)` is the account, storage is the account's,
and no constructor ever ran there.

## 2. Roles

| Role | Can | Cannot |
|---|---|---|
| account (the EOA's key) | sign `Execute` batches; send ordinary transactions | — |
| sponsor / anyone | submit a batch the account signed, paying gas | execute anything the account did not sign; change a signed batch |
| call targets | be called with the signed `to`/`value`/`data` | re-use the signature that called them |

There is no owner, admin, upgrade path or pause.

## 3. Typed data (EIP-712)

| Item | Value |
|---|---|
| Domain | `name = "BatchCallAndSponsor"`, `version = "1"`, `chainId = block.chainid`, `verifyingContract = address(this)` (the account) |
| `Call` | `(address to, uint256 value, bytes data)` |
| `Execute` | `(Call[] calls, uint256 nonce, uint256 deadline)` |
| Entry point | `execute(Call[] calls, uint256 deadline, bytes signature)`; the nonce is the account's current one |
| Signature | 65 bytes `r ‖ s ‖ v`, `v ∈ {27, 28}`, low `s` (OpenZeppelin 4.9 `ECDSA.tryRecover`) |
| Nonce storage | ERC-7201 namespace `paycrest.storage.BatchCallAndSponsor`, slot `0x2a03703f9fa6511871e434e639db8aefa945f9df0ac4204077804f0a35d36500` |

## 4. Formal properties

- **P1 Authority**: `execute` succeeds only if `signature` is the account's own (`ecrecover == address(this)`) signature over the EIP-712 `Execute` digest. Any other signer, or a malformed signature, reverts `InvalidSignature`.
- **P2 Chain binding**: a signature made for any `chainId ≠ block.chainid` is rejected.
- **P3 Account binding**: a signature made for another `verifyingContract` (another account delegating here, or the implementation address) is rejected. A normally deployed instance, whose address has no key, can never execute.
- **P4 Deadline**: `execute` succeeds only while `block.timestamp ≤ deadline` (inclusive); after it, it reverts `Expired(deadline, timestamp)`. The deadline is part of the signed struct.
- **P5 Nonce**: each successful `execute` uses the current nonce and increases it by exactly 1; a signature is valid for that nonce only, so it is single-use, and a signature for a future nonce does not execute early.
- **P6 Atomicity**: if any call in the batch fails, `execute` reverts `CallReverted(index, reason)` with the failing index and the target's revert data; no call's effect persists and the nonce is unchanged.
- **P7 Batch integrity**: changing any signed field — a call's `to`, `value` or `data`, the order or number of calls, or `deadline` — invalidates the signature.
- **P8 Legacy format rejected**: a `ProviderBatchCallAndSponsor`-format signature (`personal_sign(keccak256(nonce ‖ to ‖ value ‖ data …))`) never executes, and the legacy `execute(Call[], bytes)` calldata (any unknown selector) reverts: there is no fallback that could turn it into a successful no-op.
- **P9 Storage**: the only storage `execute` writes in the account is the ERC-7201 nonce slot; `nonce()` reads it.
- **P10 Value**: each call forwards exactly its signed `value` from the account's balance; `msg.value` sent with `execute` stays with the account; plain ETH transfers to the account succeed (`receive`).
- **P11 Reentrancy**: the nonce is consumed before any external call, so a call inside a batch cannot re-submit the same signed batch (or any batch signed for the same nonce).
- **P12 Malleability**: high-`s` signatures, `v ∉ {27, 28}` and signatures of any length other than 65 bytes are rejected.
- **P13 Views**: `domainSeparator()` equals the EIP-712 domain above for the current chain and account; `CALL_TYPEHASH` and `EXECUTE_TYPEHASH` equal the hashes of the type strings in §3.
- **P14 Events**: a successful batch emits one `CallExecuted(sponsor, to, value, data)` per call, in order, then `BatchExecuted(nonce, calls)` with the nonce it consumed.

## 5. Non-goals

- Token receive hooks (`onERC721Received`, `onERC1155Received`, ERC-777 `tokensReceived`) are not implemented: safe transfers of those tokens to a delegated account revert. Paycrest accounts hold ERC-20s and ETH.
- `ERC-1271` is not implemented: the account cannot sign for contracts that verify via `isValidSignature`.
- The account's key can always act directly with ordinary transactions; this contract does not restrict the EOA.

## 6. Verification

`make bcs-verify` runs: forge build; unit + fuzz tests; the handler invariant suite; 100% line and branch coverage
of `contracts/BatchCallAndSponsor.sol`; Halmos bounded symbolic checks (`check_` functions in
`test/foundry/BatchCallAndSponsor.halmos.t.sol`); Slither (fails on medium or high); traceability of this
document's property ids; Hardhat compile parity. CI runs it with the pinned toolchain of the OTC harness.
