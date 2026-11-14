// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title IOTCGateway
 * @notice Non-custodial escrow for OTC fiat<->token trades whose fiat leg is a manual bank transfer.
 *
 * In both directions the party who receives fiat is the party who locks tokens (the `locker`):
 *  - offramp: the sender locks, the liquidity provider wires fiat, the sender releases;
 *  - onramp:  the liquidity provider locks, the sender wires fiat, the provider releases.
 *
 * The fiat payer's signing wallet is the `counterparty`; the token destination is the `payee` (which may be an
 * exchange deposit address that cannot sign). No Paycrest key can move or freeze locked tokens: the aggregator's
 * `authSigner` only admits locks, and the `arbiter` may act only in `Paying` after `disputeDelay`.
 *
 * Specification and formal properties: docs/otc-gateway-spec.md.
 */
interface IOTCGateway {
	/* ############################################################ TYPES */

	enum Status {
		None,
		Locked,
		Paying,
		Settled,
		Refunded
	}

	enum SettledBy {
		Locker,
		Parties,
		Arbiter
	}

	enum RefundReason {
		Cancelled,
		Waived,
		Expired,
		Arbitrated
	}

	/**
	 * @dev Aggregator-signed admission ticket for one lock. Signed as EIP-712 `LockAuth` by `authSigner`.
	 * @param orderId      Payment order id (UUID as bytes32); locks at most once, ever.
	 * @param token        Whitelisted ERC20.
	 * @param locker       Party that deposits `amount`, receives fiat, and later releases (or is refunded).
	 * @param payee        Token destination on settlement. Must differ from `locker`.
	 * @param counterparty Fiat payer's signing wallet: may mark paying, waive, and co-sign a partial settlement.
	 * @param amount       Token amount to lock (gross; fee is taken from the payee side on settlement).
	 * @param deadline     After this timestamp a lock still in `Locked` can be refunded by anyone.
	 * @param feeBps       Protocol fee in MAX_BPS units, fixed for the life of the lock.
	 * @param disputeDelay Must equal the contract's current setting; stored per lock.
	 * @param quoteHash    Off-chain quote commitment (rate, fiat amount, token, currency); displayed to signers.
	 * @param validUntil   Admission ticket expiry.
	 */
	struct LockAuth {
		bytes32 orderId;
		address token;
		address locker;
		address payee;
		address counterparty;
		uint256 amount;
		uint64 deadline;
		uint32 feeBps;
		uint32 disputeDelay;
		bytes32 quoteHash;
		uint64 validUntil;
	}

	struct Lock {
		address token;
		address locker;
		address payee;
		address counterparty;
		uint256 amount;
		uint64 deadline;
		uint64 payingAt;
		uint32 feeBps;
		uint32 disputeDelay;
		Status status;
		bytes32 quoteHash;
	}

	/* ############################################################ EVENTS */

	event OtcLocked(
		bytes32 indexed orderId,
		address indexed token,
		address indexed locker,
		address payee,
		address counterparty,
		uint256 amount,
		uint64 deadline,
		uint32 feeBps,
		uint32 disputeDelay,
		bytes32 quoteHash
	);

	event OtcPaying(bytes32 indexed orderId, address indexed counterparty, uint64 payingAt);

	event OtcSettled(
		bytes32 indexed orderId,
		address indexed payee,
		uint256 payeeGross,
		uint256 fee,
		uint256 remainder,
		SettledBy by
	);

	event OtcRefunded(bytes32 indexed orderId, address indexed to, uint256 amount, RefundReason reason);

	event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);

	event ProtocolAddressUpdated(bytes32 indexed what, address indexed value);

	event DisputeDelayUpdated(uint32 disputeDelay);

	event TokenSupportUpdated(address indexed token, bool supported);

	/* ############################################################ LOCK */

	/**
	 * @notice Lock `a.amount` of `a.token` from `msg.sender` (must equal `a.locker`) against an aggregator-signed
	 * admission ticket. Pulls tokens with `transferFrom`; the caller must have approved this contract.
	 */
	function lock(LockAuth calldata a, bytes calldata authSig) external;

	/**
	 * @notice Same as {lock} but consumes an EIP-2612 permit from `a.locker`, so any relayer may submit it.
	 * If the permit does not succeed (front-run, expired, malformed) the call is only accepted from `a.locker`
	 * itself, so a standing allowance can never be exercised by a third party.
	 */
	function lockWithPermit(
		LockAuth calldata a,
		bytes calldata authSig,
		uint256 permitDeadline,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external;

	/* ############################################################ LIFECYCLE */

	/**
	 * @notice Counterparty declares it is about to wire fiat. `Locked -> Paying`. Only while `now <= deadline`.
	 * Must precede the wire: from `Paying` the locker can no longer cancel.
	 * @param sig EIP-712 `Paying` signature by `counterparty`; may be empty when `msg.sender == counterparty`.
	 */
	function markPaying(bytes32 orderId, bytes calldata sig) external;

	/**
	 * @notice Locker confirms fiat receipt and releases the full amount to `payee` (net of the fixed fee).
	 * Allowed from `Locked` or `Paying`.
	 * @param sig EIP-712 `Release` signature by `locker`; may be empty when `msg.sender == locker`.
	 */
	function settle(bytes32 orderId, bytes calldata sig) external;

	/**
	 * @notice Partial settlement for under/over-payment, agreed by both parties: `payeeGross` (net of fee) to
	 * `payee`, the remainder back to `locker`. Requires `0 < payeeGross < amount`.
	 * @param lockerSig       EIP-712 `ReleasePartial` by `locker` (empty if `msg.sender == locker`).
	 * @param counterpartySig EIP-712 `ReleasePartial` by `counterparty` (empty if `msg.sender == counterparty`).
	 */
	function settlePartial(
		bytes32 orderId,
		uint256 payeeGross,
		bytes calldata lockerSig,
		bytes calldata counterpartySig
	) external;

	/**
	 * @notice Locker takes the tokens back. Only while `Locked` (never from `Paying`).
	 * @param sig EIP-712 `Cancel` signature by `locker`; may be empty when `msg.sender == locker`.
	 */
	function cancel(bytes32 orderId, bytes calldata sig) external;

	/**
	 * @notice Counterparty gives up its claim; tokens return to `locker`. Allowed from `Locked` or `Paying`.
	 * @param sig EIP-712 `Waive` signature by `counterparty`; may be empty when `msg.sender == counterparty`.
	 */
	function waive(bytes32 orderId, bytes calldata sig) external;

	/**
	 * @notice Anyone may return tokens to `locker` once `now > deadline` and the lock is still `Locked`.
	 */
	function refundExpired(bytes32 orderId) external;

	/**
	 * @notice Arbiter resolves a lock stuck in `Paying` once `now >= payingAt + disputeDelay`.
	 * `payeeGross == 0` refunds the locker in full; `payeeGross == amount` pays the payee in full; anything in
	 * between splits. Never callable in `Locked`.
	 */
	function arbitrate(bytes32 orderId, uint256 payeeGross) external;

	/* ############################################################ VIEWS */

	function getLock(bytes32 orderId) external view returns (Lock memory);

	function isTokenSupported(address token) external view returns (bool);

	/// @notice Mirrors the retail Gateway's accessor; returns the `authSigner` (aggregator OTC key).
	function getAggregator() external view returns (address);

	function accruedFees(address token) external view returns (uint256);

	// EIP-712 digests, exposed so off-chain signers (Go aggregator, dashboard, node) can be tested byte-for-byte.
	function hashLockAuth(LockAuth calldata a) external view returns (bytes32);

	function hashPaying(bytes32 orderId) external view returns (bytes32);

	function hashRelease(bytes32 orderId) external view returns (bytes32);

	function hashReleasePartial(bytes32 orderId, uint256 payeeGross) external view returns (bytes32);

	function hashWaive(bytes32 orderId) external view returns (bytes32);

	function hashCancel(bytes32 orderId) external view returns (bytes32);
}
