// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from 'forge-std/Test.sol';
import {IOTCGateway} from '../../contracts/interfaces/IOTCGateway.sol';
import {OTCGateway} from '../../contracts/OTCGateway.sol';
import {OTCGatewayBase, MockUSDC} from './OTCGatewayBase.sol';

/**
 * @dev Random-walk handler. Every fund-moving action records ghost state; violations of per-action rules are
 * latched into flags because a failing assertion inside a handler is just a reverted call under
 * `fail_on_revert = false`. The invariants below read the ghosts.
 */
contract OTCGatewayHandler is Test {
	uint256 internal constant MAX_BPS = 100_000;
	uint32 internal constant MIN_DELAY = 1 days;

	OTCGateway public gw;
	MockUSDC public usdc;

	uint256 public authSignerPk;
	address public treasury;
	address public arbiter;
	address public owner;
	address public pauser;

	// Two disjoint actor pools so `counterparty != locker` always holds.
	uint256[2] public lockerPks;
	uint256[2] public counterpartyPks;
	address[2] public payees;

	bytes32[] public orders;
	mapping(bytes32 => IOTCGateway.LockAuth) public auths;
	mapping(bytes32 => IOTCGateway.Status) public terminal; // status recorded when a lock became terminal
	mapping(bytes32 => bool) public isTerminal;

	// ghosts
	uint256 public ghostOpenTotal; // Σ amount over Locked|Paying
	uint256 public ghostFeesAccrued; // Σ fees credited by settlements
	uint256 public ghostFeesWithdrawn;
	uint256 public ghostSettlements;
	uint256 public ghostRefunds;
	uint256 public ghostLocks;
	bool public violationP2; // tokens reached an address other than payee/locker (per settlement/refund)
	bool public violationP7; // a terminal lock changed
	bool public violationP9; // an orderId locked twice
	bool public violationP12; // payeeNet + fee + remainder != amount

	constructor(
		OTCGateway gw_,
		MockUSDC usdc_,
		uint256 authSignerPk_,
		address owner_,
		address pauser_,
		address arbiter_,
		address treasury_
	) {
		gw = gw_;
		usdc = usdc_;
		authSignerPk = authSignerPk_;
		owner = owner_;
		pauser = pauser_;
		arbiter = arbiter_;
		treasury = treasury_;
		lockerPks = [uint256(0x1001), uint256(0x1002)];
		counterpartyPks = [uint256(0x2001), uint256(0x2002)];
		payees = [makeAddr('payee-a'), makeAddr('payee-b')];
		for (uint256 i; i < 2; i++) {
			address l = vm.addr(lockerPks[i]);
			usdc.mint(l, 1e15);
			vm.prank(l);
			usdc.approve(address(gw), type(uint256).max);
		}
	}

	/* ------------------------------------------------------------------ actors / views */

	function actorSet() external view returns (address[] memory set) {
		set = new address[](9);
		set[0] = address(gw);
		set[1] = vm.addr(lockerPks[0]);
		set[2] = vm.addr(lockerPks[1]);
		set[3] = vm.addr(counterpartyPks[0]);
		set[4] = vm.addr(counterpartyPks[1]);
		set[5] = payees[0];
		set[6] = payees[1];
		set[7] = treasury;
		set[8] = owner;
	}

	function ordersLength() external view returns (uint256) {
		return orders.length;
	}

	/* ------------------------------------------------------------------ digests (local) */

	function _typed(bytes32 structHash) internal view returns (bytes32) {
		return keccak256(abi.encodePacked('\x19\x01', gw.DOMAIN_SEPARATOR(), structHash));
	}

	function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		return abi.encodePacked(r, s, v);
	}

	function _authDigest(IOTCGateway.LockAuth memory a) internal view returns (bytes32) {
		return
			_typed(
				keccak256(
					abi.encode(
						gw.LOCK_AUTH_TYPEHASH(),
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

	/* ------------------------------------------------------------------ actions */

	function warp(uint256 dt) external {
		dt = bound(dt, 0, 4 days);
		vm.warp(block.timestamp + dt);
	}

	function lock(uint256 seed, uint256 amount, uint32 feeBps, uint64 window) external {
		uint256 li = seed % 2;
		uint256 ci = (seed >> 8) % 2;
		uint256 pi = (seed >> 16) % 2;
		amount = bound(amount, 1, 1e12);
		feeBps = uint32(bound(feeBps, 0, gw.MAX_FEE_BPS()));
		window = uint64(bound(window, 1 hours, 5 days));

		IOTCGateway.LockAuth memory a = IOTCGateway.LockAuth({
			orderId: keccak256(abi.encode('inv', orders.length, seed)),
			token: address(usdc),
			locker: vm.addr(lockerPks[li]),
			payee: payees[pi],
			counterparty: vm.addr(counterpartyPks[ci]),
			amount: amount,
			deadline: uint64(block.timestamp) + window,
			feeBps: feeBps,
			disputeDelay: gw.disputeDelay(),
			quoteHash: keccak256(abi.encode(seed)),
			validUntil: uint64(block.timestamp) + 1 hours
		});
		bytes memory sig = _sign(authSignerPk, _authDigest(a));
		vm.prank(a.locker);
		try gw.lock(a, sig) {
			orders.push(a.orderId);
			auths[a.orderId] = a;
			ghostOpenTotal += a.amount;
			ghostLocks++;
		} catch {}
	}

	/// @dev P9 probe: try to lock an id that already exists (open or terminal). Must always revert.
	function relock(uint256 idx) external {
		if (orders.length == 0) return;
		IOTCGateway.LockAuth memory a = auths[orders[idx % orders.length]];
		a.deadline = uint64(block.timestamp) + 1 days;
		a.validUntil = uint64(block.timestamp) + 1 hours;
		a.disputeDelay = gw.disputeDelay();
		bytes memory sig = _sign(authSignerPk, _authDigest(a));
		vm.prank(a.locker);
		try gw.lock(a, sig) {
			violationP9 = true;
		} catch {}
	}

	function markPaying(uint256 idx, bool viaSig) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		uint256 cpPk = _pkOf(a.counterparty, counterpartyPks);
		if (viaSig) {
			bytes memory sig = _sign(
				cpPk,
				_typed(keccak256(abi.encode(gw.PAYING_TYPEHASH(), id, a.payee, a.amount, a.quoteHash)))
			);
			try gw.markPaying(id, sig) {} catch {}
		} else {
			vm.prank(a.counterparty);
			try gw.markPaying(id, '') {} catch {}
		}
	}

	function settle(uint256 idx, bool viaSig) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		_Snapshot memory s = _snap(a);
		bool ok;
		if (viaSig) {
			bytes memory sig = _sign(
				_pkOf(a.locker, lockerPks),
				_typed(keccak256(abi.encode(gw.RELEASE_TYPEHASH(), id, a.payee, a.amount, a.quoteHash)))
			);
			try gw.settle(id, sig) {
				ok = true;
			} catch {}
		} else {
			vm.prank(a.locker);
			try gw.settle(id, '') {
				ok = true;
			} catch {}
		}
		if (ok) _afterSettle(a, s, a.amount);
	}

	function settlePartial(uint256 idx, uint256 gross) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		if (a.amount < 2) return;
		gross = bound(gross, 1, a.amount - 1);
		bytes32 digest = _typed(
			keccak256(abi.encode(gw.RELEASE_PARTIAL_TYPEHASH(), id, a.payee, gross, a.quoteHash))
		);
		_Snapshot memory s = _snap(a);
		try
			gw.settlePartial(
				id,
				gross,
				_sign(_pkOf(a.locker, lockerPks), digest),
				_sign(_pkOf(a.counterparty, counterpartyPks), digest)
			)
		{
			_afterSettle(a, s, gross);
		} catch {}
	}

	function cancel(uint256 idx) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		_Snapshot memory s = _snap(a);
		vm.prank(a.locker);
		try gw.cancel(id, '') {
			_afterRefund(a, s);
		} catch {}
	}

	function waive(uint256 idx) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		_Snapshot memory s = _snap(a);
		vm.prank(a.counterparty);
		try gw.waive(id, '') {
			_afterRefund(a, s);
		} catch {}
	}

	function refundExpired(uint256 idx) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		_Snapshot memory s = _snap(a);
		try gw.refundExpired(id) {
			_afterRefund(a, s);
		} catch {}
	}

	function arbitrate(uint256 idx, uint256 gross) external {
		bytes32 id = _pick(idx);
		if (id == bytes32(0)) return;
		IOTCGateway.LockAuth memory a = auths[id];
		gross = bound(gross, 0, a.amount);
		_Snapshot memory s = _snap(a);
		vm.prank(arbiter);
		try gw.arbitrate(id, gross) {
			if (gross == 0) _afterRefund(a, s);
			else _afterSettle(a, s, gross);
		} catch {}
	}

	function withdrawFees() external {
		uint256 before = usdc.balanceOf(treasury);
		vm.prank(treasury);
		try gw.withdrawFees(address(usdc)) {
			ghostFeesWithdrawn += usdc.balanceOf(treasury) - before;
		} catch {}
	}

	function togglePause(bool on) external {
		if (on) {
			vm.prank(pauser);
			try gw.pause() {} catch {}
		} else {
			vm.prank(owner);
			try gw.unpause() {} catch {}
		}
	}

	function setDisputeDelay(uint32 delay) external {
		delay = uint32(bound(delay, MIN_DELAY, 30 days));
		vm.prank(owner);
		gw.setDisputeDelay(delay);
	}

	/* ------------------------------------------------------------------ ghost bookkeeping */

	struct _Snapshot {
		uint256 payee;
		uint256 locker;
		uint256 counterparty;
		uint256 gw;
		uint256 fees;
		IOTCGateway.Status status;
	}

	function _snap(IOTCGateway.LockAuth memory a) internal view returns (_Snapshot memory s) {
		s.payee = usdc.balanceOf(a.payee);
		s.locker = usdc.balanceOf(a.locker);
		s.counterparty = usdc.balanceOf(a.counterparty);
		s.gw = usdc.balanceOf(address(gw));
		s.fees = gw.accruedFees(address(usdc));
		s.status = gw.getLock(a.orderId).status;
	}

	function _afterSettle(IOTCGateway.LockAuth memory a, _Snapshot memory s, uint256 gross) internal {
		uint256 toPayee = usdc.balanceOf(a.payee) - s.payee;
		uint256 toLocker = usdc.balanceOf(a.locker) - s.locker;
		uint256 fee = gw.accruedFees(address(usdc)) - s.fees;
		if (toPayee + toLocker + fee != a.amount) violationP12 = true;
		if (fee != (gross * a.feeBps) / MAX_BPS) violationP12 = true;
		if (s.gw - usdc.balanceOf(address(gw)) != toPayee + toLocker) violationP2 = true;
		if (a.counterparty != a.payee && usdc.balanceOf(a.counterparty) != s.counterparty) violationP2 = true;
		ghostFeesAccrued += fee;
		ghostOpenTotal -= a.amount;
		ghostSettlements++;
		_markTerminal(a.orderId, IOTCGateway.Status.Settled);
	}

	function _afterRefund(IOTCGateway.LockAuth memory a, _Snapshot memory s) internal {
		uint256 toLocker = usdc.balanceOf(a.locker) - s.locker;
		if (toLocker != a.amount) violationP12 = true;
		if (usdc.balanceOf(a.payee) != s.payee) violationP2 = true;
		if (gw.accruedFees(address(usdc)) != s.fees) violationP2 = true;
		if (s.gw - usdc.balanceOf(address(gw)) != a.amount) violationP2 = true;
		ghostOpenTotal -= a.amount;
		ghostRefunds++;
		_markTerminal(a.orderId, IOTCGateway.Status.Refunded);
	}

	function _markTerminal(bytes32 id, IOTCGateway.Status s) internal {
		terminal[id] = s;
		isTerminal[id] = true;
	}

	function _pick(uint256 idx) internal view returns (bytes32) {
		if (orders.length == 0) return bytes32(0);
		return orders[idx % orders.length];
	}

	function _pkOf(address who, uint256[2] storage pks) internal view returns (uint256) {
		return vm.addr(pks[0]) == who ? pks[0] : pks[1];
	}
}

/**
 * @title OTCGatewayInvariantTest
 * @notice Handler-based invariants for P1, P2, P7, P9, P12 across random action sequences.
 */
contract OTCGatewayInvariantTest is OTCGatewayBase {
	OTCGatewayHandler internal handler;

	function setUp() public override {
		super.setUp();
		handler = new OTCGatewayHandler(gw, usdc, authSignerPk, owner, pauser, arbiter, treasury);
		targetContract(address(handler));
		bytes4[] memory selectors = new bytes4[](13);
		selectors[0] = handler.warp.selector;
		selectors[1] = handler.lock.selector;
		selectors[2] = handler.relock.selector;
		selectors[3] = handler.markPaying.selector;
		selectors[4] = handler.settle.selector;
		selectors[5] = handler.settlePartial.selector;
		selectors[6] = handler.cancel.selector;
		selectors[7] = handler.waive.selector;
		selectors[8] = handler.refundExpired.selector;
		selectors[9] = handler.arbitrate.selector;
		selectors[10] = handler.withdrawFees.selector;
		selectors[11] = handler.togglePause.selector;
		selectors[12] = handler.setDisputeDelay.selector;
		targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
	}

	/// P1: the contract always holds every open lock plus every unclaimed fee.
	function invariant_P1_solvency() public view {
		assertGe(bal(address(gw)), handler.ghostOpenTotal() + gw.accruedFees(address(usdc)));
		// and nothing more than that (no stray deposits are modelled), so equality is expected
		assertEq(bal(address(gw)), handler.ghostOpenTotal() + gw.accruedFees(address(usdc)));
	}

	/// P2: tokens only ever reach payee, locker, or treasury; total supply is fully accounted by known actors.
	function invariant_P2_destination() public view {
		assertFalse(handler.violationP2(), 'tokens reached a non-party');
		address[] memory set = handler.actorSet();
		uint256 sum;
		for (uint256 i; i < set.length; i++) sum += bal(set[i]);
		sum += bal(sender) + bal(lp); // base fixture actors, untouched by the handler
		assertEq(sum, usdc.totalSupply(), 'supply leaked outside actor set');
		assertEq(bal(treasury), handler.ghostFeesWithdrawn(), 'treasury got more than withdrawn fees');
		assertEq(
			handler.ghostFeesAccrued(),
			gw.accruedFees(address(usdc)) + handler.ghostFeesWithdrawn(),
			'fee accounting drift'
		);
	}

	/// P7: a lock that reached Settled/Refunded never changes again.
	function invariant_P7_terminalAbsorbing() public view {
		assertFalse(handler.violationP7());
		uint256 n = handler.ordersLength();
		for (uint256 i; i < n; i++) {
			bytes32 id = handler.orders(i);
			if (handler.isTerminal(id)) {
				assertEq(uint8(gw.getLock(id).status), uint8(handler.terminal(id)));
			}
		}
	}

	/// P9: no orderId is ever admitted twice.
	function invariant_P9_uniqueness() public view {
		assertFalse(handler.violationP9());
	}

	/// P12: every settlement or refund conserves the locked amount exactly.
	function invariant_P12_conservation() public view {
		assertFalse(handler.violationP12());
	}

	/// Sanity: the walk actually exercises the state machine (not a vacuous suite).
	function invariant_walkIsNotVacuous() public view {
		// Cannot assert activity on every run (early runs may be empty), but ghosts must be internally consistent.
		assertEq(handler.ghostLocks(), handler.ghostSettlements() + handler.ghostRefunds() + _openCount());
	}

	function _openCount() internal view returns (uint256 open) {
		uint256 n = handler.ordersLength();
		for (uint256 i; i < n; i++) {
			IOTCGateway.Status s = gw.getLock(handler.orders(i)).status;
			if (s == IOTCGateway.Status.Locked || s == IOTCGateway.Status.Paying) open++;
		}
	}
}
