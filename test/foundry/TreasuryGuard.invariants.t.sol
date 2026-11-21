// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import 'forge-std/Test.sol';
import {TreasuryGuard} from '../../contracts/TreasuryGuard.sol';
import {IDelay, Operation} from '../../contracts/interfaces/ISafe.sol';
import {TreasuryBase, ISafe, TestToken} from './TreasuryBase.sol';

/**
 * Drives one treasury through random sequences of normal-path transfers (any subset of the owners signing, the
 * co-signer alone, duplicated signatures), recovery transactions (queued by any subset of the admins, executed
 * at any time, cancelled through the normal path) and time jumps. Every outflow goes to `recipient`, and the
 * ghost counters record which path moved it, so the invariants can check that nothing else ever does.
 */
contract TreasuryHandler is TreasuryBase {
	struct Queued {
		uint256 amount;
		uint256 createdAt;
	}

	// Ghosts
	uint256 public cosignedOut;
	uint256 public recoveryOut;
	uint256 public uncosignedSuccesses;
	uint256 public cosignerAloneSuccesses;
	uint256 public earlyRecoveries;
	uint256 public expiredSuccesses;
	uint256 public calls;
	mapping(uint256 => Queued) internal queued;

	struct Held {
		bytes data;
		bytes sigs;
		uint256 amount;
		uint256 deadline;
	}

	/// Co-signed transfers someone kept instead of relaying.
	Held[] internal held;

	function init() external {
		setUp();
	}

	function _execRaw(ISafe safe, address to, bytes memory data, bytes memory sigs) internal returns (bool ok) {
		vm.prank(keeper);
		(ok, ) = address(safe).call(
			abi.encodeCall(ISafe.execTransaction, (to, 0, data, Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs))
		);
	}

	function _amount(uint256 raw) internal view returns (uint256) {
		uint256 bal = token.balanceOf(address(treasury));
		return bal == 0 ? 0 : bound(raw, 1, bal);
	}

	/// Any subset of {member, passkey, co-signer} of size >= 2 signs a transfer.
	function normal(uint8 mask, uint256 raw) external {
		++calls;
		mask = uint8(bound(mask, 3, 7));
		if (mask == 4) return;
		uint256 amount = _amount(raw);
		if (amount == 0) return;
		address[3] memory all = [member, address(passkey), cosigner];
		uint256 n;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) ++n;
		Signer[] memory signers = new Signer[](n);
		uint256 k;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) signers[k++] = _s(all[i]);
		bytes memory data = _transferData(recipient, amount);
		bool ok = _execRaw(treasury, address(token), data, _sign(treasury, signers, address(token), 0, data, Operation.Call));
		if (ok && mask & 4 == 0) ++uncosignedSuccesses;
		if (ok) cosignedOut += amount;
	}

	/// The co-signer tries to act alone: once, twice (duplicate), or in two encodings.
	function cosignerAlone(uint8 how, uint256 raw) external {
		++calls;
		uint256 amount = _amount(raw);
		if (amount == 0) return;
		bytes memory data = _transferData(recipient, amount);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(cosignerPk, h);
		bytes memory one = bytes.concat(r, s, bytes1(v));
		bytes memory sigs;
		how = uint8(bound(how, 0, 2));
		if (how == 0) sigs = one;
		else if (how == 1) sigs = bytes.concat(one, one);
		else sigs = bytes.concat(one, bytes32(uint256(uint160(cosigner))), bytes32(0), bytes1(0x01));
		// With a valid attestation, so only the co-signer-alone rule (P2) stands in the way.
		sigs = bytes.concat(sigs, _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL));
		if (_execRaw(treasury, address(token), data, sigs)) {
			++cosignerAloneSuccesses;
			cosignedOut += amount;
		}
	}

	/// A member and the co-signer sign a transfer that someone keeps instead of relaying.
	function hold(uint256 raw) external {
		++calls;
		uint256 amount = _amount(raw);
		if (amount == 0) return;
		bytes memory data = _transferData(recipient, amount);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);
		held.push(Held(data, sigs, amount, block.timestamp + COSIGN_TTL));
	}

	/// Whoever kept a co-signed transfer relays it, whenever.
	function relayHeld(uint256 which) external {
		++calls;
		if (held.length == 0) return;
		Held memory hd = held[bound(which, 0, held.length - 1)];
		if (_execRaw(treasury, address(token), hd.data, hd.sigs)) {
			if (block.timestamp > hd.deadline) ++expiredSuccesses;
			cosignedOut += hd.amount;
		}
	}

	/// Any subset of the admins (size >= 2) queues a recovery transfer.
	function queueRecovery(uint8 mask, uint256 raw) external {
		++calls;
		mask = uint8(bound(mask, 3, 7));
		if (mask == 4) return;
		uint256 amount = _amount(raw);
		if (amount == 0) return;
		address[3] memory all = [admin1, admin2, admin3];
		uint256 n;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) ++n;
		Signer[] memory signers = new Signer[](n);
		uint256 k;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) signers[k++] = _s(all[i]);
		bytes memory q = abi.encodeCall(IDelay.execTransactionFromModule, (address(token), 0, _transferData(recipient, amount), Operation.Call));
		uint256 qn = delay.queueNonce();
		if (_execRaw(recovery, address(delay), q, _sign(recovery, signers, address(delay), 0, q, Operation.Call))) {
			queued[qn] = Queued(amount, block.timestamp);
		}
	}

	/// Anyone tries to run the next queued recovery transaction, whenever.
	function executeRecovery() external {
		++calls;
		uint256 tn = delay.txNonce();
		if (tn >= delay.queueNonce()) return;
		Queued memory qd = queued[tn];
		(bool ok, ) = address(delay).call(
			abi.encodeCall(IDelay.executeNextTx, (address(token), 0, _transferData(recipient, qd.amount), Operation.Call))
		);
		if (ok) {
			if (block.timestamp < qd.createdAt + COOLDOWN) ++earlyRecoveries;
			recoveryOut += qd.amount;
		}
	}

	/// A member and the co-signer cancel everything queued.
	function cancelRecovery() external {
		++calls;
		uint256 qn = delay.queueNonce();
		if (delay.txNonce() >= qn) return;
		bytes memory data = abi.encodeCall(IDelay.setTxNonce, (qn));
		_execRaw(treasury, address(delay), data, _sign(treasury, _signers(_s(member), _s(cosigner)), address(delay), 0, data, Operation.Call));
	}

	function warp(uint256 dt) external {
		++calls;
		vm.warp(block.timestamp + bound(dt, 0, 3 days));
	}

	// Views for the invariants
	function treasuryAddr() external view returns (address) {
		return address(treasury);
	}

	function guardAddr() external view returns (address) {
		return address(guard);
	}

	function delayAddr() external view returns (address) {
		return address(delay);
	}

	function tokenAddr() external view returns (address) {
		return address(token);
	}

	function recipientAddr() external view returns (address) {
		return recipient;
	}

	function cosignerAddr() external view returns (address) {
		return cosigner;
	}
}

contract TreasuryGuardInvariants is Test {
	TreasuryHandler internal handler;
	uint256 internal startBalance;

	function setUp() public {
		handler = new TreasuryHandler();
		handler.init();
		startBalance = TestToken(handler.tokenAddr()).balanceOf(handler.treasuryAddr());
		bytes4[] memory selectors = new bytes4[](8);
		selectors[0] = TreasuryHandler.normal.selector;
		selectors[1] = TreasuryHandler.cosignerAlone.selector;
		selectors[2] = TreasuryHandler.queueRecovery.selector;
		selectors[3] = TreasuryHandler.executeRecovery.selector;
		selectors[4] = TreasuryHandler.cancelRecovery.selector;
		selectors[5] = TreasuryHandler.warp.selector;
		selectors[6] = TreasuryHandler.hold.selector;
		selectors[7] = TreasuryHandler.relayHeld.selector;
		targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
		targetContract(address(handler));
	}

	/// Members never move funds on the normal path without the co-signer.
	function invariant_P1_noUncosignedTransfers() public view {
		assertEq(handler.uncosignedSuccesses(), 0);
	}

	/// The co-signer never moves funds alone, in any encoding.
	function invariant_P2_cosignerNeverAlone() public view {
		assertEq(handler.cosignerAloneSuccesses(), 0);
	}

	/// No co-signed transaction ever runs after its deadline.
	function invariant_P15_noExpiredCosignatureRuns() public view {
		assertEq(handler.expiredSuccesses(), 0);
	}

	/// Recovery transactions only ever run after their cooldown.
	function invariant_P12_recoveryNeverEarly() public view {
		assertEq(handler.earlyRecoveries(), 0);
	}

	/// Every token that left the treasury left through a co-signed transaction or a timelocked recovery.
	function invariant_P7_everyOutflowAccounted() public view {
		TestToken t = TestToken(handler.tokenAddr());
		uint256 out = t.balanceOf(handler.recipientAddr());
		assertEq(out, handler.cosignedOut() + handler.recoveryOut());
		assertEq(t.balanceOf(handler.treasuryAddr()) + out, startBalance);
	}

	/// The guard, its co-signer and the timelock stay as set up.
	function invariant_P11_wiringStable() public view {
		ISafe t = ISafe(handler.treasuryAddr());
		assertEq(TreasuryGuard(handler.guardAddr()).cosignerOf(address(t)), handler.cosignerAddr());
		assertEq(t.getThreshold(), 2);
		assertTrue(t.isModuleEnabled(handler.delayAddr()));
	}
}
