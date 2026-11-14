// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IERC20Permit} from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {SignatureChecker} from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';

import {IOTCGateway, IERC20} from './interfaces/IOTCGateway.sol';

/**
 * @title OTCGateway
 * @notice Immutable, non-custodial escrow for OTC fiat<->token trades. See {IOTCGateway} and
 * docs/otc-gateway-spec.md for the trust model and the formal properties (P1-P15) this contract is tested against.
 *
 * Money-moving authority, by design:
 *  - tokens leave a lock only to `payee` or `locker` (fees accrue in-contract and are pulled by `treasury`);
 *  - the payee is paid only on the locker's signed release, a locker+counterparty co-signed partial, or the
 *    arbiter after `disputeDelay` in `Paying`;
 *  - the owner can stop new locks and rotate roles, never touch an existing lock;
 *  - every action a party can authorize by signature it can also send itself, so liveness never depends on a relay.
 */
contract OTCGateway is IOTCGateway, EIP712, ReentrancyGuard, Pausable, Ownable2Step {
	using SafeERC20 for IERC20;

	/* ############################################################ CONSTANTS */

	uint256 public constant MAX_BPS = 100_000;
	uint32 public constant MAX_FEE_BPS = 2_000; // 2%
	uint32 public constant MIN_DISPUTE_DELAY = 1 days;
	uint32 public constant MAX_DISPUTE_DELAY = 30 days;

	bytes32 public constant LOCK_AUTH_TYPEHASH =
		keccak256(
			'LockAuth(bytes32 orderId,address token,address locker,address payee,address counterparty,uint256 amount,uint64 deadline,uint32 feeBps,uint32 disputeDelay,bytes32 quoteHash,uint64 validUntil)'
		);
	bytes32 public constant PAYING_TYPEHASH =
		keccak256('Paying(bytes32 orderId,address payee,uint256 amount,bytes32 quoteHash)');
	bytes32 public constant RELEASE_TYPEHASH =
		keccak256('Release(bytes32 orderId,address payee,uint256 amount,bytes32 quoteHash)');
	bytes32 public constant RELEASE_PARTIAL_TYPEHASH =
		keccak256('ReleasePartial(bytes32 orderId,address payee,uint256 payeeGross,bytes32 quoteHash)');
	bytes32 public constant WAIVE_TYPEHASH = keccak256('Waive(bytes32 orderId)');
	bytes32 public constant CANCEL_TYPEHASH = keccak256('Cancel(bytes32 orderId)');

	/* ############################################################ STORAGE */

	address public pauser;
	address public authSigner;
	address public arbiter;
	address public treasury;
	uint32 public disputeDelay;

	mapping(address => bool) private _supportedToken;
	mapping(bytes32 => Lock) private _locks;
	mapping(address => uint256) public override accruedFees;

	/* ############################################################ CONSTRUCTOR */

	constructor(
		address owner_,
		address pauser_,
		address authSigner_,
		address arbiter_,
		address treasury_,
		uint32 disputeDelay_
	) EIP712('PaycrestOTCGateway', '1') {
		require(
			owner_ != address(0) &&
				pauser_ != address(0) &&
				authSigner_ != address(0) &&
				arbiter_ != address(0) &&
				treasury_ != address(0),
			'ZeroAddress'
		);
		_setDisputeDelay(disputeDelay_);
		pauser = pauser_;
		authSigner = authSigner_;
		arbiter = arbiter_;
		treasury = treasury_;
		_transferOwnership(owner_);
	}

	/* ############################################################ MODIFIERS */

	modifier onlyOpen(bytes32 orderId) {
		Status s = _locks[orderId].status;
		// slither-disable-next-line incorrect-equality
		require(s == Status.Locked || s == Status.Paying, 'NotOpen');
		_;
	}

	/* ############################################################ LOCK */

	/** @dev See {IOTCGateway-lock}. */
	function lock(LockAuth calldata a, bytes calldata authSig) external whenNotPaused nonReentrant {
		require(msg.sender == a.locker, 'OnlyLocker');
		_lock(a, authSig);
	}

	/** @dev See {IOTCGateway-lockWithPermit}. */
	function lockWithPermit(
		LockAuth calldata a,
		bytes calldata authSig,
		uint256 permitDeadline,
		uint8 v,
		bytes32 r,
		bytes32 s
	) external whenNotPaused nonReentrant {
		// A relayer may only pull the locker's tokens on the strength of the locker's own permit. If the permit
		// does not go through (already consumed by a front-runner, expired, malformed) the call falls back to the
		// plain-lock rule: only the locker may submit. This keeps a standing allowance from being usable by anyone
		// but the locker, while a front-run permit never bricks the locker's own submission.
		bool permitted = false;
		try IERC20Permit(a.token).permit(a.locker, address(this), a.amount, permitDeadline, v, r, s) {
			permitted = true;
		} catch {}
		if (!permitted) require(msg.sender == a.locker, 'OnlyLocker');
		_lock(a, authSig);
	}

	function _lock(LockAuth calldata a, bytes calldata authSig) internal {
		require(
			a.locker != address(0) && a.payee != address(0) && a.counterparty != address(0),
			'ZeroAddress'
		);
		require(a.payee != a.locker, 'PayeeIsLocker');
		require(a.counterparty != a.locker, 'CounterpartyIsLocker');
		require(a.amount != 0, 'AmountIsZero');
		require(a.feeBps <= MAX_FEE_BPS, 'FeeTooHigh');
		require(a.disputeDelay == disputeDelay, 'DisputeDelayMismatch');
		require(block.timestamp <= a.validUntil, 'AuthExpired');
		require(a.deadline > block.timestamp, 'DeadlinePassed');
		require(_supportedToken[a.token], 'TokenNotSupported');
		// slither-disable-next-line incorrect-equality
		require(_locks[a.orderId].status == Status.None, 'OrderAlreadyExists');
		require(SignatureChecker.isValidSignatureNow(authSigner, hashLockAuth(a), authSig), 'InvalidAuthSignature');

		_locks[a.orderId] = Lock({
			token: a.token,
			locker: a.locker,
			payee: a.payee,
			counterparty: a.counterparty,
			amount: a.amount,
			deadline: a.deadline,
			payingAt: 0,
			feeBps: a.feeBps,
			disputeDelay: a.disputeDelay,
			status: Status.Locked,
			quoteHash: a.quoteHash
		});

		// Balance-delta check rejects fee-on-transfer / rebasing tokens. The read-before-call pattern is intended
		// and the function is nonReentrant; `from` is the ticket's locker, enforced by lock/lockWithPermit above.
		IERC20 token = IERC20(a.token);
		uint256 before = token.balanceOf(address(this));
		// slither-disable-next-line arbitrary-send-erc20,reentrancy-balance
		token.safeTransferFrom(a.locker, address(this), a.amount);
		// slither-disable-next-line incorrect-equality
		require(token.balanceOf(address(this)) - before == a.amount, 'TokenTransferMismatch');

		emit OtcLocked(
			a.orderId,
			a.token,
			a.locker,
			a.payee,
			a.counterparty,
			a.amount,
			a.deadline,
			a.feeBps,
			a.disputeDelay,
			a.quoteHash
		);
	}

	/* ############################################################ LIFECYCLE */

	/** @dev See {IOTCGateway-markPaying}. */
	function markPaying(bytes32 orderId, bytes calldata sig) external {
		Lock storage l = _locks[orderId];
		require(l.status == Status.Locked, 'NotLocked');
		require(block.timestamp <= l.deadline, 'DeadlinePassed');
		_requireAuth(l.counterparty, hashPaying(orderId), sig);

		l.status = Status.Paying;
		l.payingAt = uint64(block.timestamp);
		emit OtcPaying(orderId, l.counterparty, l.payingAt);
	}

	/** @dev See {IOTCGateway-settle}. */
	function settle(bytes32 orderId, bytes calldata sig) external nonReentrant onlyOpen(orderId) {
		Lock storage l = _locks[orderId];
		_requireAuth(l.locker, hashRelease(orderId), sig);
		_settle(l, orderId, l.amount, SettledBy.Locker);
	}

	/** @dev See {IOTCGateway-settlePartial}. */
	function settlePartial(
		bytes32 orderId,
		uint256 payeeGross,
		bytes calldata lockerSig,
		bytes calldata counterpartySig
	) external nonReentrant onlyOpen(orderId) {
		Lock storage l = _locks[orderId];
		require(payeeGross != 0 && payeeGross < l.amount, 'InvalidPartialAmount');
		bytes32 digest = hashReleasePartial(orderId, payeeGross);
		_requireAuth(l.locker, digest, lockerSig);
		_requireAuth(l.counterparty, digest, counterpartySig);
		_settle(l, orderId, payeeGross, SettledBy.Parties);
	}

	/** @dev See {IOTCGateway-cancel}. */
	function cancel(bytes32 orderId, bytes calldata sig) external nonReentrant {
		Lock storage l = _locks[orderId];
		require(l.status == Status.Locked, 'NotLocked');
		_requireAuth(l.locker, hashCancel(orderId), sig);
		_refund(l, orderId, RefundReason.Cancelled);
	}

	/** @dev See {IOTCGateway-waive}. */
	function waive(bytes32 orderId, bytes calldata sig) external nonReentrant onlyOpen(orderId) {
		Lock storage l = _locks[orderId];
		_requireAuth(l.counterparty, hashWaive(orderId), sig);
		_refund(l, orderId, RefundReason.Waived);
	}

	/** @dev See {IOTCGateway-refundExpired}. */
	function refundExpired(bytes32 orderId) external nonReentrant {
		Lock storage l = _locks[orderId];
		require(l.status == Status.Locked, 'NotLocked');
		require(block.timestamp > l.deadline, 'NotExpired');
		_refund(l, orderId, RefundReason.Expired);
	}

	/** @dev See {IOTCGateway-arbitrate}. */
	function arbitrate(bytes32 orderId, uint256 payeeGross) external nonReentrant {
		require(msg.sender == arbiter, 'OnlyArbiter');
		Lock storage l = _locks[orderId];
		require(l.status == Status.Paying, 'NotPaying');
		require(block.timestamp >= uint256(l.payingAt) + l.disputeDelay, 'DisputeDelayNotElapsed');
		require(payeeGross <= l.amount, 'InvalidAmount');

		if (payeeGross == 0) {
			_refund(l, orderId, RefundReason.Arbitrated);
		} else {
			_settle(l, orderId, payeeGross, SettledBy.Arbiter);
		}
	}

	/* ############################################################ INTERNAL */

	/**
	 * @dev A party authorizes either by being `msg.sender` or by a valid EIP-712 signature (EOA or ERC-1271).
	 */
	function _requireAuth(address signer, bytes32 digest, bytes calldata sig) internal view {
		if (msg.sender == signer) return;
		require(SignatureChecker.isValidSignatureNow(signer, digest, sig), 'InvalidSignature');
	}

	/**
	 * @dev Single settlement formula (P3/P12): fee = payeeGross * feeBps / MAX_BPS accrues in-contract,
	 * payee receives payeeGross - fee, locker receives amount - payeeGross. No call to treasury (P15).
	 */
	function _settle(Lock storage l, bytes32 orderId, uint256 payeeGross, SettledBy by) internal {
		l.status = Status.Settled;

		uint256 fee = (payeeGross * l.feeBps) / MAX_BPS;
		uint256 payeeNet = payeeGross - fee;
		uint256 remainder = l.amount - payeeGross;

		accruedFees[l.token] += fee;

		IERC20 token = IERC20(l.token);
		if (payeeNet != 0) token.safeTransfer(l.payee, payeeNet);
		if (remainder != 0) token.safeTransfer(l.locker, remainder);

		emit OtcSettled(orderId, l.payee, payeeGross, fee, remainder, by);
	}

	function _refund(Lock storage l, bytes32 orderId, RefundReason reason) internal {
		l.status = Status.Refunded;
		IERC20(l.token).safeTransfer(l.locker, l.amount);
		emit OtcRefunded(orderId, l.locker, l.amount, reason);
	}

	function _setDisputeDelay(uint32 delay) internal {
		require(delay >= MIN_DISPUTE_DELAY && delay <= MAX_DISPUTE_DELAY, 'DisputeDelayOutOfBounds');
		disputeDelay = delay;
		emit DisputeDelayUpdated(delay);
	}

	/* ############################################################ OWNER / PAUSER / TREASURY */

	/// @notice Blocks new locks only; every open lock keeps all of its exits (P8).
	function pause() external {
		require(msg.sender == pauser || msg.sender == owner(), 'OnlyPauser');
		_pause();
	}

	function unpause() external onlyOwner {
		_unpause();
	}

	function setPauser(address value) external onlyOwner {
		require(value != address(0), 'ZeroAddress');
		pauser = value;
		emit ProtocolAddressUpdated('pauser', value);
	}

	/// @dev Outstanding LockAuths signed by the previous key stop being accepted; the aggregator re-issues them.
	function setAuthSigner(address value) external onlyOwner {
		require(value != address(0), 'ZeroAddress');
		authSigner = value;
		emit ProtocolAddressUpdated('authSigner', value);
	}

	function setArbiter(address value) external onlyOwner {
		require(value != address(0), 'ZeroAddress');
		arbiter = value;
		emit ProtocolAddressUpdated('arbiter', value);
	}

	function setTreasury(address value) external onlyOwner {
		require(value != address(0), 'ZeroAddress');
		treasury = value;
		emit ProtocolAddressUpdated('treasury', value);
	}

	/// @dev Applies to new locks only; existing locks keep the delay they were created with (P11).
	function setDisputeDelay(uint32 delay) external onlyOwner {
		_setDisputeDelay(delay);
	}

	/// @dev De-whitelisting blocks new locks for that token only (P8).
	function setTokenSupported(address token, bool supported) external onlyOwner {
		require(token != address(0), 'ZeroAddress');
		_supportedToken[token] = supported;
		emit TokenSupportUpdated(token, supported);
	}

	/// @notice Pull accrued protocol fees for `token` to `treasury`. Callable by treasury or owner.
	function withdrawFees(address token) external nonReentrant {
		require(msg.sender == treasury || msg.sender == owner(), 'OnlyTreasury');
		uint256 amount = accruedFees[token];
		require(amount != 0, 'NoFees');
		accruedFees[token] = 0;
		IERC20(token).safeTransfer(treasury, amount);
		emit FeesWithdrawn(token, treasury, amount);
	}

	/* ############################################################ VIEWS */

	function getLock(bytes32 orderId) external view returns (Lock memory) {
		return _locks[orderId];
	}

	function isTokenSupported(address token) external view returns (bool) {
		return _supportedToken[token];
	}

	function getAggregator() external view returns (address) {
		return authSigner;
	}

	// solhint-disable-next-line func-name-mixedcase
	function DOMAIN_SEPARATOR() external view returns (bytes32) {
		return _domainSeparatorV4();
	}

	function hashLockAuth(LockAuth calldata a) public view returns (bytes32) {
		return
			_hashTypedDataV4(
				keccak256(
					abi.encode(
						LOCK_AUTH_TYPEHASH,
						a.orderId,
						a.token,
						a.locker,
						a.payee,
						a.counterparty,
						a.amount,
						a.deadline,
						a.feeBps,
						a.disputeDelay,
						a.quoteHash,
						a.validUntil
					)
				)
			);
	}

	function hashPaying(bytes32 orderId) public view returns (bytes32) {
		Lock storage l = _locks[orderId];
		return _hashTypedDataV4(keccak256(abi.encode(PAYING_TYPEHASH, orderId, l.payee, l.amount, l.quoteHash)));
	}

	function hashRelease(bytes32 orderId) public view returns (bytes32) {
		Lock storage l = _locks[orderId];
		return _hashTypedDataV4(keccak256(abi.encode(RELEASE_TYPEHASH, orderId, l.payee, l.amount, l.quoteHash)));
	}

	function hashReleasePartial(bytes32 orderId, uint256 payeeGross) public view returns (bytes32) {
		Lock storage l = _locks[orderId];
		return
			_hashTypedDataV4(
				keccak256(abi.encode(RELEASE_PARTIAL_TYPEHASH, orderId, l.payee, payeeGross, l.quoteHash))
			);
	}

	function hashWaive(bytes32 orderId) public view returns (bytes32) {
		return _hashTypedDataV4(keccak256(abi.encode(WAIVE_TYPEHASH, orderId)));
	}

	function hashCancel(bytes32 orderId) public view returns (bytes32) {
		return _hashTypedDataV4(keccak256(abi.encode(CANCEL_TYPEHASH, orderId)));
	}
}
