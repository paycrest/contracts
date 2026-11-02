// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {BatchCallAndSponsor} from '../../contracts/BatchCallAndSponsor.sol';
import {BatchCallAndSponsorBase, Recorder, Reverter} from './BatchCallAndSponsorBase.sol';

/**
 * @dev Random-walk handler over one delegated account. Every attempt that must fail latches a violation flag if
 * it succeeds (a failed assertion inside a handler is only a reverted call under `fail_on_revert = false`); the
 * invariants read the flags and ghost counters.
 */
contract BatchCallAndSponsorHandler is BatchCallAndSponsorBase {
	struct Signed {
		BatchCallAndSponsor.Call[] calls;
		uint256 deadline;
		bytes sig;
	}

	address[3] internal payees;
	Signed[] internal used;

	uint256 public ghostExecuted;
	uint256 public ghostTokensOut;
	uint256 public ghostEthOut;
	uint256 public ghostEthIn;
	bool public violationP1; // a signature not by the account executed
	bool public violationP2; // a signature for another chain executed
	bool public violationP4; // an expired batch executed
	bool public violationP5; // a used signature executed again, or the nonce did not step by exactly one
	bool public violationP6; // a batch with a failing call changed state
	bool public violationP9; // execute wrote storage other than the nonce slot

	constructor() {
		setUp();
		payees = [address(0xA1), address(0xA2), address(0xA3)];
	}

	function account_() external view returns (address) {
		return account;
	}

	function token_() external view returns (address) {
		return address(token);
	}

	function recorder_() external view returns (address) {
		return address(recorder);
	}

	function payeeBalances() external view returns (uint256 total) {
		for (uint256 i; i < payees.length; i++) total += token.balanceOf(payees[i]);
	}

	function _batch(uint256 seed) internal view returns (BatchCallAndSponsor.Call[] memory calls) {
		uint256 n = bound(seed, 0, 3);
		calls = new BatchCallAndSponsor.Call[](n);
		for (uint256 i; i < n; i++) {
			uint256 s = uint256(keccak256(abi.encode(seed, i)));
			if (s % 2 == 0) {
				calls[i] = BatchCallAndSponsor.Call(
					address(token),
					0,
					abi.encodeCall(token.transfer, (payees[s % 3], bound(s, 0, 1e18)))
				);
			} else {
				calls[i] = BatchCallAndSponsor.Call(
					address(recorder),
					bound(s, 0, 0.01 ether),
					abi.encodeCall(Recorder.record, (abi.encode(s)))
				);
			}
		}
	}

	function _outflow(BatchCallAndSponsor.Call[] memory calls) internal view returns (uint256 tokens, uint256 eth) {
		for (uint256 i; i < calls.length; i++) {
			eth += calls[i].value;
			if (calls[i].to == address(token)) {
				(, uint256 amount) = abi.decode(_slice4(calls[i].data), (address, uint256));
				tokens += amount;
			}
		}
	}

	function _slice4(bytes memory data) internal pure returns (bytes memory out) {
		out = new bytes(data.length - 4);
		for (uint256 i; i < out.length; i++) out[i] = data[i + 4];
	}

	/* ---------------------------------------------------------------- actions */

	function executeValid(uint256 seed, uint32 ttl) external {
		BatchCallAndSponsor.Call[] memory calls = _batch(seed);
		uint256 deadline = block.timestamp + ttl;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		uint256 before = nonceOf(account);
		vm.record();
		(bool ok, ) = exec(account, calls, deadline, sig);
		(, bytes32[] memory writes) = vm.accesses(account);
		if (!ok) return; // e.g. ran out of balance: allowed to fail
		for (uint256 i; i < writes.length; i++) if (writes[i] != NONCE_SLOT) violationP9 = true;
		if (nonceOf(account) != before + 1) violationP5 = true;
		ghostExecuted++;
		(uint256 t, uint256 e) = _outflow(calls);
		ghostTokensOut += t;
		ghostEthOut += e;
		used.push();
		Signed storage rec = used[used.length - 1];
		for (uint256 i; i < calls.length; i++) rec.calls.push(calls[i]);
		rec.deadline = deadline;
		rec.sig = sig;
	}

	function replayUsed(uint256 index) external {
		if (used.length == 0) return;
		Signed storage rec = used[bound(index, 0, used.length - 1)];
		(bool ok, ) = exec(account, rec.calls, rec.deadline, rec.sig);
		if (ok) violationP5 = true;
	}

	function executeOtherKey(uint256 seed, uint256 pk) external {
		pk = bound(pk, 1, SECP256K1_ORDER - 1);
		if (pk == accountPk) return;
		BatchCallAndSponsor.Call[] memory calls = _batch(seed);
		uint256 deadline = block.timestamp + 60;
		(bool ok, ) = exec(account, calls, deadline, signBatch(pk, account, calls, deadline));
		if (ok) violationP1 = true;
	}

	function executeOtherChain(uint256 seed, uint256 chainId) external {
		if (chainId == block.chainid) return;
		BatchCallAndSponsor.Call[] memory calls = _batch(seed);
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(accountPk, digestFor(chainId, account, calls, nonceOf(account), deadline));
		(bool ok, ) = exec(account, calls, deadline, sig);
		if (ok) violationP2 = true;
	}

	function executeExpired(uint256 seed, uint32 age) external {
		age = uint32(bound(age, 1, type(uint32).max));
		if (block.timestamp < age) return;
		BatchCallAndSponsor.Call[] memory calls = _batch(seed);
		uint256 deadline = block.timestamp - age;
		(bool ok, ) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		if (ok) violationP4 = true;
	}

	function executeFailing(uint256 seed) external {
		BatchCallAndSponsor.Call[] memory head = _batch(seed);
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](head.length + 1);
		for (uint256 i; i < head.length; i++) calls[i] = head[i];
		calls[head.length] = BatchCallAndSponsor.Call(address(reverter), 0, abi.encodeCall(Reverter.fail, (seed)));
		uint256 deadline = block.timestamp + 60;
		uint256 n = nonceOf(account);
		uint256 tokenBal = token.balanceOf(account);
		uint256 ethBal = account.balance;
		(bool ok, ) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		if (ok || nonceOf(account) != n || token.balanceOf(account) != tokenBal || account.balance != ethBal) {
			violationP6 = true;
		}
	}

	function receiveEth(uint96 amount) external {
		vm.deal(address(this), amount);
		(bool ok, ) = payable(account).call{value: amount}('');
		if (ok) ghostEthIn += amount;
	}

	function warp(uint32 dt) external {
		vm.warp(block.timestamp + bound(dt, 0, 7 days));
	}
}

/**
 * @title BatchCallAndSponsorInvariants
 */
contract BatchCallAndSponsorInvariants is BatchCallAndSponsorBase {
	BatchCallAndSponsorHandler internal handler;
	uint256 internal startTokens;
	uint256 internal startEth;

	function setUp() public override {
		handler = new BatchCallAndSponsorHandler();
		startTokens = MockLike(handler.token_()).balanceOf(handler.account_());
		startEth = handler.account_().balance;
		targetContract(address(handler));
		bytes4[] memory selectors = new bytes4[](8);
		selectors[0] = BatchCallAndSponsorHandler.executeValid.selector;
		selectors[1] = BatchCallAndSponsorHandler.replayUsed.selector;
		selectors[2] = BatchCallAndSponsorHandler.executeOtherKey.selector;
		selectors[3] = BatchCallAndSponsorHandler.executeOtherChain.selector;
		selectors[4] = BatchCallAndSponsorHandler.executeExpired.selector;
		selectors[5] = BatchCallAndSponsorHandler.executeFailing.selector;
		selectors[6] = BatchCallAndSponsorHandler.receiveEth.selector;
		selectors[7] = BatchCallAndSponsorHandler.warp.selector;
		targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
	}

	function invariant_P1_onlyAccountSignaturesExecute() public view {
		assertFalse(handler.violationP1());
	}

	function invariant_P2_otherChainNeverExecutes() public view {
		assertFalse(handler.violationP2());
	}

	function invariant_P4_expiredNeverExecutes() public view {
		assertFalse(handler.violationP4());
	}

	/// The nonce equals the number of executed batches; no signature ran twice.
	function invariant_P5_nonceCountsExecutedBatches() public view {
		assertFalse(handler.violationP5());
		assertEq(BatchCallAndSponsor(payable(handler.account_())).nonce(), handler.ghostExecuted());
	}

	function invariant_P6_failingBatchesChangeNothing() public view {
		assertFalse(handler.violationP6());
	}

	function invariant_P9_onlyNonceSlotWritten() public view {
		assertFalse(handler.violationP9());
	}

	/// Value conservation: what left the account is exactly what executed batches signed for.
	function invariant_P10_valueConservation() public view {
		address acct = handler.account_();
		assertEq(MockLike(handler.token_()).balanceOf(acct), startTokens - handler.ghostTokensOut());
		assertEq(handler.payeeBalances(), handler.ghostTokensOut());
		assertEq(acct.balance, startEth + handler.ghostEthIn() - handler.ghostEthOut());
		assertEq(handler.recorder_().balance, handler.ghostEthOut());
	}
}

interface MockLike {
	function balanceOf(address) external view returns (uint256);
}
