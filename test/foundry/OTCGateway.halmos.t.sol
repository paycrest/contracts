// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IOTCGateway} from '../../contracts/interfaces/IOTCGateway.sol';
import {OTCGatewayBase} from './OTCGatewayBase.sol';

/**
 * @title OTCGatewayHalmos
 * @notice Bounded symbolic checks (Halmos runs every `check_` function for all inputs). Each check states an
 * authority or liveness property as "if the call succeeded then <condition>", over a symbolic caller and,
 * where relevant, a symbolic signing key. Halmos models `vm.sign`/`ecrecover` so a signature only validates for
 * `vm.addr(pk)`.
 *
 * Fixture: ORDER is an offramp lock in `Locked` (locker = sender, counterparty = lp, payee = lpPayout);
 * ORDER2 is an onramp lock in `Paying` (locker = lp, counterparty = sender, payee = exchange).
 */
contract OTCGatewayHalmos is OTCGatewayBase {
	bytes32 internal constant ORDER2 = keccak256('order-2');
	address internal exchange = address(0xE5C4A96E);
	uint64 internal deadline1;
	uint64 internal payingAt2;

	function setUp() public override {
		// Halmos models vm.addr as an uninterpreted function, so the base fixture's role addresses would be
		// symbolic (and could even collide). Pin every role to a concrete, distinct EOA; signatures still work
		// because a check's `vm.addr(pk) == role` is satisfiable exactly when pk is that role's key.
		sender = address(uint160(0x5e01));
		lp = address(uint160(0x1101));
		lpPayout = address(uint160(0x9a01));
		stranger = address(uint160(0x5701));
		arbiter = address(uint160(0xa2b1));
		owner = address(uint160(0xa11ce1));
		pauser = address(uint160(0xb0b1));
		treasury = address(uint160(0x7e01));
		// authSigner stays vm.addr(authSignerPk): the admission check compares ecrecover's symbolic result with it,
		// and only a syntactically equal term keeps setUp on a single path. Constrain it like a real key would be.
		vm.assume(authSigner != address(0));
		address[9] memory concrete = [sender, lp, lpPayout, exchange, stranger, arbiter, owner, pauser, treasury];
		for (uint256 i; i < concrete.length; i++) vm.assume(authSigner != concrete[i]);
		super.setUp();
		IOTCGateway.LockAuth memory a = defaultAuth();
		deadline1 = a.deadline;
		lockAs(a);

		IOTCGateway.LockAuth memory b = defaultAuth();
		b.orderId = ORDER2;
		b.locker = lp;
		b.counterparty = sender;
		b.payee = exchange;
		lockAs(b);
		vm.prank(sender);
		gw.markPaying(ORDER2, '');
		payingAt2 = uint64(block.timestamp);
	}

	/// @dev Halmos keeps `v` symbolic and forks on it inside ecrecover, which would give setUp two successful
	/// paths. Fix a representative (`v == 27`): this suite never runs under Forge, and the authority properties
	/// do not depend on which of the two malleable encodings a signer used.
	function signDigest(uint256 pk, bytes32 digest) internal pure override returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		vm.assume(uint256(s) <= SECP256K1_ORDER / 2 && v == 27);
		vm.assume(vm.addr(pk) != address(0));
		return abi.encodePacked(r, s, v);
	}

	function _call(address caller, bytes memory data) internal returns (bool ok) {
		vm.prank(caller);
		(ok, ) = address(gw).call(data);
	}

	function _validPk(uint256 pk) internal pure {
		vm.assume(pk > 0 && pk < SECP256K1_ORDER);
		vm.assume(vm.addr(pk) != address(0));
	}

	/* ==================================================================================== P4 */

	/// settle without a signature succeeds only for the locker.
	function check_P4_settleNoSigOnlyLocker(address caller) public {
		bool ok = _call(caller, abi.encodeCall(gw.settle, (ORDER, '')));
		assert(!ok || caller == sender);
	}

	/// settle with a signature succeeds only if the signer is the locker (or the caller is).
	function check_P4_settleSigOnlyLocker(address caller, uint256 pk) public {
		_validPk(pk);
		bytes memory sig = signDigest(pk, hashReleaseLocal(ORDER));
		bool ok = _call(caller, abi.encodeCall(gw.settle, (ORDER, sig)));
		assert(!ok || caller == sender || vm.addr(pk) == sender);
	}

	/// arbitrate succeeds only for the arbiter, only in Paying, only after the lock's dispute delay.
	function check_P4_arbitrateOnlyArbiterAfterDelay(address caller, uint256 gross, uint64 dt) public {
		vm.assume(dt <= 60 days);
		vm.warp(uint256(payingAt2) + dt);
		bool ok = _call(caller, abi.encodeCall(gw.arbitrate, (ORDER2, gross)));
		assert(!ok || (caller == arbiter && dt >= DISPUTE_DELAY && gross <= AMOUNT));
		// and never on a lock that is merely Locked
		bool ok2 = _call(caller, abi.encodeCall(gw.arbitrate, (ORDER, gross)));
		assert(!ok2);
	}

	/// settlePartial needs both parties: a single signer (or a single msg.sender) is never enough.
	function check_P4_settlePartialNeedsBothParties(address caller, uint256 pk, uint256 gross) public {
		_validPk(pk);
		vm.assume(gross > 0 && gross < AMOUNT);
		bytes memory sig = signDigest(pk, hashReleasePartialLocal(ORDER2, gross));
		address signer = vm.addr(pk);
		// one signature + the caller
		bool ok = _call(caller, abi.encodeCall(gw.settlePartial, (ORDER2, gross, sig, '')));
		assert(!ok || ((caller == lp || signer == lp) && caller == sender));
		bool ok2 = _call(caller, abi.encodeCall(gw.settlePartial, (ORDER2, gross, '', sig)));
		assert(!ok2 || (caller == lp && (caller == sender || signer == sender)));
	}

	/* ==================================================================================== P5 */

	/// Only the counterparty (by presence or signature) can enter Paying.
	function check_P5_onlyCounterpartyMarksPaying(address caller, uint256 pk) public {
		_validPk(pk);
		bytes memory sig = signDigest(pk, hashPayingLocal(ORDER));
		bool ok = _call(caller, abi.encodeCall(gw.markPaying, (ORDER, sig)));
		assert(!ok || caller == lp || vm.addr(pk) == lp);
		bool ok2 = _call(caller, abi.encodeCall(gw.markPaying, (ORDER, '')));
		assert(!ok2 || caller == lp);
	}

	/// From Paying, the locker alone can never get tokens back: cancel/refundExpired always revert.
	function check_P5_lockerCannotExitPaying(address caller, uint256 pk, uint64 dt) public {
		_validPk(pk);
		vm.assume(dt <= 60 days);
		vm.warp(block.timestamp + dt);
		bytes memory sig = signDigest(pk, hashCancelLocal(ORDER2));
		assert(!_call(caller, abi.encodeCall(gw.cancel, (ORDER2, sig))));
		assert(!_call(caller, abi.encodeCall(gw.cancel, (ORDER2, ''))));
		assert(!_call(caller, abi.encodeCall(gw.refundExpired, (ORDER2))));
	}

	/// From Paying, a refund to the locker happens only via the counterparty's waive (or arbiter, see P4).
	function check_P5_waiveOnlyCounterparty(address caller, uint256 pk) public {
		_validPk(pk);
		bytes memory sig = signDigest(pk, hashWaiveLocal(ORDER2));
		bool ok = _call(caller, abi.encodeCall(gw.waive, (ORDER2, sig)));
		assert(!ok || caller == sender || vm.addr(pk) == sender); // ORDER2 counterparty is `sender`
	}

	/* ==================================================================================== P6 */

	/// While Locked, the locker can always cancel, whatever the pause/whitelist state.
	function check_P6_lockerCanAlwaysCancelWhileLocked(bool paused, bool dewhitelist) public {
		if (paused) {
			vm.prank(pauser);
			gw.pause();
		}
		if (dewhitelist) {
			vm.prank(owner);
			gw.setTokenSupported(address(usdc), false);
		}
		uint256 before = bal(sender);
		assert(_call(sender, abi.encodeCall(gw.cancel, (ORDER, ''))));
		assert(bal(sender) == before + AMOUNT);
	}

	/// refundExpired succeeds for anyone exactly when the deadline has passed (and the lock is still Locked).
	function check_P6_refundExpiredIffPastDeadline(address caller, uint64 dt) public {
		vm.assume(dt <= 60 days);
		vm.warp(block.timestamp + dt);
		bool ok = _call(caller, abi.encodeCall(gw.refundExpired, (ORDER)));
		assert(ok == (block.timestamp > deadline1));
	}

	/// markPaying can never freeze a lock past its deadline.
	function check_P6_noPayingAfterDeadline(uint64 dt) public {
		vm.assume(dt <= 60 days);
		vm.warp(block.timestamp + dt);
		bool ok = _call(lp, abi.encodeCall(gw.markPaying, (ORDER, '')));
		assert(ok == (block.timestamp <= deadline1));
	}

	/* ==================================================================================== P8 */

	/// Pausing blocks only new locks; the exits keep working.
	function check_P8_pauseBlocksOnlyLock(address caller, uint256 amount) public {
		vm.assume(amount > 0 && amount <= AMOUNT);
		vm.prank(pauser);
		gw.pause();
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = keccak256('order-3');
		a.amount = amount;
		bytes memory sig = signAuth(a);
		assert(!_call(sender, abi.encodeCall(gw.lock, (a, sig))));
		assert(!_call(caller, abi.encodeCall(gw.lock, (a, sig))));
		// exits
		assert(_call(sender, abi.encodeCall(gw.settle, (ORDER, ''))));
		assert(_call(sender, abi.encodeCall(gw.waive, (ORDER2, ''))));
	}

	/* ==================================================================================== P10 */

	/// A lock is admitted only when the ticket is signed by authSigner and submitted by its locker.
	function check_P10_lockNeedsAuthSignerAndLocker(address caller, uint256 pk, uint256 amount) public {
		_validPk(pk);
		vm.assume(amount > 0 && amount <= AMOUNT);
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = keccak256('order-3');
		a.amount = amount;
		registerAuth(a);
		bytes memory sig = signDigest(pk, hashAuth(a));
		bool ok = _call(caller, abi.encodeCall(gw.lock, (a, sig)));
		assert(!ok || (caller == sender && vm.addr(pk) == authSigner));
	}

	/* ==================================================================================== P14 */

	/// @dev Halmos models ecrecover as an uninterpreted function: for a digest other than the one signed it may
	/// return any address, i.e. it can "forge". Encode existential unforgeability explicitly: a signature made over
	/// one digest recovers, under a *different* digest, to none of the parties. The assumption only covers the
	/// foreign digest, so a contract that mistakenly checked the wrong digest would still be caught.
	function _assumeNoForgery(uint8 v, bytes32 r, bytes32 s, bytes32 foreignDigest) internal view {
		address rec = ecrecover(foreignDigest, v, r, s);
		vm.assume(rec != sender && rec != lp && rec != authSigner && rec != arbiter && rec != owner);
	}

	function _sign712(uint256 pk, bytes32 digest) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
		(v, r, s) = vm.sign(pk, digest);
		vm.assume(uint256(s) <= SECP256K1_ORDER / 2 && v == 27);
		vm.assume(vm.addr(pk) != address(0));
	}

	/// A release signed for ORDER never settles ORDER2, whoever signed it.
	function check_P14_releaseIsBoundToOrder(uint256 pk) public {
		_validPk(pk);
		(uint8 v, bytes32 r, bytes32 s) = _sign712(pk, hashReleaseLocal(ORDER));
		_assumeNoForgery(v, r, s, hashReleaseLocal(ORDER2));
		assert(!_call(stranger, abi.encodeCall(gw.settle, (ORDER2, abi.encodePacked(r, s, v)))));
	}

	/// A Paying signature is never a Release, a Waive, or a Cancel.
	function check_P14_actionsAreDistinct(uint256 pk) public {
		_validPk(pk);
		(uint8 v, bytes32 r, bytes32 s) = _sign712(pk, hashPayingLocal(ORDER));
		_assumeNoForgery(v, r, s, hashReleaseLocal(ORDER));
		_assumeNoForgery(v, r, s, hashWaiveLocal(ORDER));
		_assumeNoForgery(v, r, s, hashCancelLocal(ORDER));
		bytes memory paying = abi.encodePacked(r, s, v);
		assert(!_call(stranger, abi.encodeCall(gw.settle, (ORDER, paying))));
		assert(!_call(stranger, abi.encodeCall(gw.waive, (ORDER, paying))));
		assert(!_call(stranger, abi.encodeCall(gw.cancel, (ORDER, paying))));
	}
}
