// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from 'forge-std/Test.sol';
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {ERC20Permit} from '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import {IERC1271} from '@openzeppelin/contracts/interfaces/IERC1271.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

import {OTCGateway} from '../../contracts/OTCGateway.sol';
import {IOTCGateway} from '../../contracts/interfaces/IOTCGateway.sol';

/* ==================================================================================================== mocks */

/// @dev 6-decimal USDC-like token with EIP-2612 permit and a Circle-style blacklist.
contract MockUSDC is ERC20Permit {
	mapping(address => bool) public blacklisted;

	constructor() ERC20('USD Coin', 'USDC') ERC20Permit('USD Coin') {}

	function decimals() public pure override returns (uint8) {
		return 6;
	}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function setBlacklisted(address account, bool value) external {
		blacklisted[account] = value;
	}

	function _beforeTokenTransfer(address from, address to, uint256) internal view override {
		require(!blacklisted[from] && !blacklisted[to], 'Blacklistable: account is blacklisted');
	}
}

/// @dev Burns 1% on every transfer; must be rejected by the lock's balance-delta check.
contract MockFeeOnTransferToken is ERC20 {
	constructor() ERC20('FeeToken', 'FEE') {}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function _transfer(address from, address to, uint256 amount) internal override {
		uint256 burn = amount / 100;
		super._burn(from, burn);
		super._transfer(from, to, amount - burn);
	}
}

/// @dev Token whose transfers call back into the gateway (P13). `target`/`payload` are set by the test.
contract MockReentrantToken is ERC20 {
	address public target;
	bytes public payload;
	bool public armed;

	constructor() ERC20('Reentrant', 'RNT') {}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function arm(address target_, bytes calldata payload_) external {
		target = target_;
		payload = payload_;
		armed = true;
	}

	/// @dev A reverted outer call rolls `armed` back to true; tests disarm explicitly between attempts.
	function disarm() external {
		armed = false;
	}

	function _afterTokenTransfer(address, address, uint256) internal override {
		if (armed) {
			armed = false;
			(bool ok, bytes memory ret) = target.call(payload);
			// Bubble the gateway's revert so the test can assert on the reentrancy guard message.
			if (!ok) {
				assembly {
					revert(add(ret, 0x20), mload(ret))
				}
			}
		}
	}
}

/// @dev Minimal ERC-1271 smart wallet owned by one EOA (stands in for a Safe).
contract MockERC1271Wallet is IERC1271 {
	address public immutable owner;

	constructor(address owner_) {
		owner = owner_;
	}

	function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
		(address recovered, ECDSA.RecoverError err) = ECDSA.tryRecover(hash, signature);
		if (err == ECDSA.RecoverError.NoError && recovered == owner) return IERC1271.isValidSignature.selector;
		return bytes4(0);
	}

	/// @dev Lets the wallet act as `msg.sender` (e.g. approve + lock) in tests.
	function exec(address to, bytes calldata data) external returns (bytes memory) {
		(bool ok, bytes memory ret) = to.call(data);
		require(ok, string(ret));
		return ret;
	}
}

/// @dev Reverts on any call and cannot receive tokens (blacklisted); used to prove P15.
contract RevertingTreasury {
	fallback() external payable {
		revert('treasury down');
	}
}

/* ==================================================================================================== base */

/**
 * @dev Shared fixture: a deployed OTCGateway, USDC, and named actors with private keys so tests can sign
 * typed data. Offramp shape by default: sender locks (locker), LP wallet pays fiat (counterparty), LP
 * settlement address receives tokens (payee).
 */
abstract contract OTCGatewayBase is Test {
	// Redeclared for `vm.expectEmit` (solc 0.8.20 cannot `emit IOTCGateway.X`).
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
		IOTCGateway.SettledBy by
	);
	event OtcRefunded(bytes32 indexed orderId, address indexed to, uint256 amount, IOTCGateway.RefundReason reason);
	event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);
	event ProtocolAddressUpdated(bytes32 indexed what, address indexed value);
	event DisputeDelayUpdated(uint32 disputeDelay);
	event TokenSupportUpdated(address indexed token, bool supported);

	uint256 internal constant MAX_BPS = 100_000;
	uint32 internal constant DISPUTE_DELAY = 3 days;
	uint32 internal constant FEE_BPS = 500; // 0.5%
	uint64 internal constant LOCK_WINDOW = 2 days;
	uint64 internal constant AUTH_VALIDITY = 15 minutes;
	uint256 internal constant AMOUNT = 250_000e6;
	bytes32 internal constant ORDER = keccak256('order-1');
	bytes32 internal constant QUOTE = keccak256('quote-1');

	OTCGateway internal gw;
	MockUSDC internal usdc;

	uint256 internal ownerPk = 0xA11CE;
	uint256 internal pauserPk = 0xB0B;
	uint256 internal authSignerPk = 0xA0;
	uint256 internal arbiterPk = 0xA2B;
	uint256 internal treasuryPk = 0x7E;
	uint256 internal senderPk = 0x5E;
	uint256 internal lpPk = 0x11;
	uint256 internal strangerPk = 0x57;

	address internal owner = vm.addr(ownerPk);
	address internal pauser = vm.addr(pauserPk);
	address internal authSigner = vm.addr(authSignerPk);
	address internal arbiter = vm.addr(arbiterPk);
	address internal treasury = vm.addr(treasuryPk);
	address internal sender = vm.addr(senderPk); // locker (offramp)
	address internal lp = vm.addr(lpPk); // counterparty (offramp)
	address internal lpPayout = makeAddr('lpPayout'); // payee (offramp)
	address internal stranger = vm.addr(strangerPk);

	function setUp() public virtual {
		vm.warp(1_800_000_000);
		usdc = new MockUSDC();
		gw = new OTCGateway(owner, pauser, authSigner, arbiter, treasury, DISPUTE_DELAY);
		vm.prank(owner);
		gw.setTokenSupported(address(usdc), true);

		usdc.mint(sender, 10 * AMOUNT);
		usdc.mint(lp, 10 * AMOUNT);
		vm.prank(sender);
		usdc.approve(address(gw), type(uint256).max);
		vm.prank(lp);
		usdc.approve(address(gw), type(uint256).max);

		domain = gw.DOMAIN_SEPARATOR();
		vm.label(address(gw), 'OTCGateway');
		vm.label(sender, 'sender');
		vm.label(lp, 'lp');
		vm.label(lpPayout, 'lpPayout');
	}

	/* ------------------------------------------------------------------ EIP-712 (computed locally) */
	// Helpers never call the gateway: a view call would consume a pending vm.prank / vm.expectRevert.
	// The vectors test asserts these local digests equal the contract's hash* views byte for byte.

	bytes32 internal constant LOCK_AUTH_TYPEHASH =
		keccak256(
			'LockAuth(bytes32 orderId,address token,address locker,address payee,address counterparty,uint256 amount,uint64 deadline,uint32 feeBps,uint32 disputeDelay,bytes32 quoteHash,uint64 validUntil)'
		);
	bytes32 internal constant PAYING_TYPEHASH =
		keccak256('Paying(bytes32 orderId,address payee,uint256 amount,bytes32 quoteHash)');
	bytes32 internal constant RELEASE_TYPEHASH =
		keccak256('Release(bytes32 orderId,address payee,uint256 amount,bytes32 quoteHash)');
	bytes32 internal constant RELEASE_PARTIAL_TYPEHASH =
		keccak256('ReleasePartial(bytes32 orderId,address payee,uint256 payeeGross,bytes32 quoteHash)');
	bytes32 internal constant WAIVE_TYPEHASH = keccak256('Waive(bytes32 orderId)');
	bytes32 internal constant CANCEL_TYPEHASH = keccak256('Cancel(bytes32 orderId)');

	bytes32 internal domain; // gw.DOMAIN_SEPARATOR(), cached in setUp
	mapping(bytes32 => IOTCGateway.LockAuth) internal auths; // orderId => auth the test issued

	function domainFor(address verifyingContract) internal view returns (bytes32) {
		return
			keccak256(
				abi.encode(
					keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
					keccak256('PaycrestOTCGateway'),
					keccak256('1'),
					block.chainid,
					verifyingContract
				)
			);
	}

	function typed(bytes32 structHash) internal view returns (bytes32) {
		return keccak256(abi.encodePacked('\x19\x01', domain, structHash));
	}

	function hashAuth(IOTCGateway.LockAuth memory a) internal view returns (bytes32) {
		return
			typed(
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

	function hashPayingLocal(bytes32 orderId) internal view returns (bytes32) {
		IOTCGateway.LockAuth storage a = auths[orderId];
		return typed(keccak256(abi.encode(PAYING_TYPEHASH, orderId, a.payee, a.amount, a.quoteHash)));
	}

	function hashReleaseLocal(bytes32 orderId) internal view returns (bytes32) {
		IOTCGateway.LockAuth storage a = auths[orderId];
		return typed(keccak256(abi.encode(RELEASE_TYPEHASH, orderId, a.payee, a.amount, a.quoteHash)));
	}

	function hashReleasePartialLocal(bytes32 orderId, uint256 payeeGross) internal view returns (bytes32) {
		IOTCGateway.LockAuth storage a = auths[orderId];
		return typed(keccak256(abi.encode(RELEASE_PARTIAL_TYPEHASH, orderId, a.payee, payeeGross, a.quoteHash)));
	}

	function hashWaiveLocal(bytes32 orderId) internal view returns (bytes32) {
		return typed(keccak256(abi.encode(WAIVE_TYPEHASH, orderId)));
	}

	function hashCancelLocal(bytes32 orderId) internal view returns (bytes32) {
		return typed(keccak256(abi.encode(CANCEL_TYPEHASH, orderId)));
	}

	/* ------------------------------------------------------------------ LockAuth helpers */

	function defaultAuth() internal view returns (IOTCGateway.LockAuth memory a) {
		a = IOTCGateway.LockAuth({
			orderId: ORDER,
			token: address(usdc),
			locker: sender,
			payee: lpPayout,
			counterparty: lp,
			amount: AMOUNT,
			deadline: uint64(block.timestamp) + LOCK_WINDOW,
			feeBps: FEE_BPS,
			disputeDelay: DISPUTE_DELAY,
			quoteHash: QUOTE,
			validUntil: uint64(block.timestamp) + AUTH_VALIDITY
		});
	}

	/// @dev Remember the auth so action digests (Paying/Release/...) can be derived without calling the gateway.
	function registerAuth(IOTCGateway.LockAuth memory a) internal {
		auths[a.orderId] = a;
	}

	function signAuth(IOTCGateway.LockAuth memory a) internal returns (bytes memory) {
		registerAuth(a);
		return signDigest(authSignerPk, hashAuth(a));
	}

	function signAuthWith(uint256 pk, IOTCGateway.LockAuth memory a) internal returns (bytes memory) {
		registerAuth(a);
		return signDigest(pk, hashAuth(a));
	}

	function signDigest(uint256 pk, bytes32 digest) internal pure virtual returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		// Always true for Foundry's real signer (low-s, v in {27,28}); tells Halmos' symbolic signer the same so
		// OZ ECDSA's malleability check cannot produce spurious counterexamples.
		vm.assume(uint256(s) <= SECP256K1_ORDER / 2 && (v == 27 || v == 28));
		vm.assume(vm.addr(pk) != address(0)); // no real key maps to the zero address
		return abi.encodePacked(r, s, v);
	}

	/// @dev Locks the default offramp order as the sender. Returns the auth used.
	function lockDefault() internal returns (IOTCGateway.LockAuth memory a) {
		a = defaultAuth();
		lockAs(a);
	}

	function lockAs(IOTCGateway.LockAuth memory a) internal {
		bytes memory sig = signAuth(a);
		vm.prank(a.locker);
		gw.lock(a, sig);
	}

	/* ------------------------------------------------------------------ action signature helpers */

	function sigPaying(uint256 pk, bytes32 orderId) internal view returns (bytes memory) {
		return signDigest(pk, hashPayingLocal(orderId));
	}

	function sigRelease(uint256 pk, bytes32 orderId) internal view returns (bytes memory) {
		return signDigest(pk, hashReleaseLocal(orderId));
	}

	function sigReleasePartial(uint256 pk, bytes32 orderId, uint256 payeeGross) internal view returns (bytes memory) {
		return signDigest(pk, hashReleasePartialLocal(orderId, payeeGross));
	}

	function sigWaive(uint256 pk, bytes32 orderId) internal view returns (bytes memory) {
		return signDigest(pk, hashWaiveLocal(orderId));
	}

	function sigCancel(uint256 pk, bytes32 orderId) internal view returns (bytes memory) {
		return signDigest(pk, hashCancelLocal(orderId));
	}

	/* ------------------------------------------------------------------ state helpers */

	function status(bytes32 orderId) internal view returns (IOTCGateway.Status) {
		return gw.getLock(orderId).status;
	}

	function markPayingDefault() internal {
		vm.prank(lp);
		gw.markPaying(ORDER, '');
	}

	function feeFor(uint256 payeeGross) internal pure returns (uint256) {
		return (payeeGross * FEE_BPS) / MAX_BPS;
	}

	function bal(address who) internal view returns (uint256) {
		return usdc.balanceOf(who);
	}
}
