// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {BatchCallAndSponsor} from '../../contracts/BatchCallAndSponsor.sol';
import {BatchCallAndSponsorBase, Recorder, Reverter, Reentrant} from './BatchCallAndSponsorBase.sol';

/**
 * @title BatchCallAndSponsorTest
 * @notice Unit and fuzz tests, one or more per property in docs/batch-call-and-sponsor-spec.md.
 */
contract BatchCallAndSponsorTest is BatchCallAndSponsorBase {
	address internal payee = address(0xBEEF);

	// Same signatures as BatchCallAndSponsor's events (solc 0.8.20 cannot emit them by qualified name).
	event CallExecuted(address indexed sender, address indexed to, uint256 value, bytes data);
	event BatchExecuted(uint256 indexed nonce, BatchCallAndSponsor.Call[] calls);

	/* ==================================================================================== P1 */

	function test_P1_accountSignatureExecutes() public {
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 12e18);
		uint256 deadline = block.timestamp + 60;
		(bool ok, ) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		assertTrue(ok);
		assertEq(token.balanceOf(payee), 12e18);
		assertEq(token.balanceOf(account), 988e18);
	}

	function testFuzz_P1_otherSignerRejected(uint256 pk) public {
		pk = bound(pk, 1, SECP256K1_ORDER - 1);
		vm.assume(vm.addr(pk) != account);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		(bool ok, bytes memory ret) = exec(account, calls, deadline, signBatch(pk, account, calls, deadline));
		assertFalse(ok);
		assertEq(bytes4(ret), BatchCallAndSponsor.InvalidSignature.selector);
		assertEq(token.balanceOf(payee), 0);
		assertEq(nonceOf(account), 0);
	}

	function testFuzz_P1_arbitrarySignatureBytesRejected(bytes32 r, bytes32 s, uint8 v) public {
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		(bool ok, ) = exec(account, calls, block.timestamp, abi.encodePacked(r, s, v));
		// A random signature recovering to the account would mean breaking secp256k1.
		assertFalse(ok);
	}

	/* ==================================================================================== P2 */

	function testFuzz_P2_otherChainRejected(uint256 chainId) public {
		vm.assume(chainId != block.chainid);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(accountPk, digestFor(chainId, account, calls, 0, deadline));
		(bool ok, bytes memory ret) = exec(account, calls, deadline, sig);
		assertFalse(ok);
		assertEq(bytes4(ret), BatchCallAndSponsor.InvalidSignature.selector);
	}

	function test_P2_signatureFromAnotherChainReplaysNowhere() public {
		// Sign on chain 8453, then the same account on chain 42161 (same nonce): refused there.
		vm.chainId(8453);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 5e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		vm.chainId(42161);
		(bool ok, ) = exec(account, calls, deadline, sig);
		assertFalse(ok);
		vm.chainId(8453);
		(ok, ) = exec(account, calls, deadline, sig);
		assertTrue(ok);
	}

	/* ==================================================================================== P3 */

	function test_P3_signatureForAnotherAccountRejected() public {
		// `other` also delegates here and holds the same token: the account's batch must not run there.
		token.transfer(other, 100e18);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory sigForAccount = signBatch(accountPk, account, calls, deadline);
		(bool ok, ) = exec(other, calls, deadline, sigForAccount);
		assertFalse(ok, 'account-signed batch ran on another account');
		// other's own key, but signed for the account's domain
		bytes memory otherKeyAccountDomain = signDigest(otherPk, digest(account, calls, 0, deadline));
		(ok, ) = exec(other, calls, deadline, otherKeyAccountDomain);
		assertFalse(ok, 'wrong verifyingContract accepted');
		assertEq(token.balanceOf(payee), 0);
	}

	function testFuzz_P3_deployedInstanceNeverExecutes(uint256 pk) public {
		pk = bound(pk, 1, SECP256K1_ORDER - 1);
		BatchCallAndSponsor.Call[] memory calls = one(address(recorder), 0, abi.encodeCall(Recorder.record, ('x')));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(pk, digest(address(impl), calls, 0, deadline));
		(bool ok, ) = exec(address(impl), calls, deadline, sig);
		assertFalse(ok); // no key controls a contract-created address
		assertEq(recorder.calls(), 0);
	}

	/* ==================================================================================== P4 */

	function testFuzz_P4_deadlineInclusive(uint256 deadline, uint256 now_) public {
		now_ = bound(now_, 1, type(uint64).max);
		deadline = bound(deadline, 0, type(uint64).max);
		vm.warp(now_);
		BatchCallAndSponsor.Call[] memory calls = one(address(recorder), 0, abi.encodeCall(Recorder.record, ('d')));
		(bool ok, bytes memory ret) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		if (now_ <= deadline) {
			assertTrue(ok);
		} else {
			assertFalse(ok);
			assertEq(ret, abi.encodeWithSelector(BatchCallAndSponsor.Expired.selector, deadline, now_));
		}
	}

	function test_P4_executesAtDeadlineNotAfter() public {
		BatchCallAndSponsor.Call[] memory calls = one(address(recorder), 0, abi.encodeCall(Recorder.record, ('d')));
		uint256 deadline = block.timestamp + 10;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		vm.warp(deadline + 1);
		(bool ok, ) = exec(account, calls, deadline, sig);
		assertFalse(ok);
		vm.warp(deadline);
		(ok, ) = exec(account, calls, deadline, sig);
		assertTrue(ok);
	}

	/* ==================================================================================== P5 */

	function testFuzz_P5_nonceStepsByOneAndSignaturesAreSingleUse(uint8 rounds) public {
		rounds = uint8(bound(rounds, 1, 12));
		uint256 deadline = block.timestamp + 60;
		for (uint256 i; i < rounds; i++) {
			BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
			bytes memory sig = signBatch(accountPk, account, calls, deadline);
			// A signature for the next nonce does not run early.
			bytes memory future = signDigest(accountPk, digest(account, calls, i + 1, deadline));
			(bool early, ) = exec(account, calls, deadline, future);
			assertFalse(early);

			(bool ok, ) = exec(account, calls, deadline, sig);
			assertTrue(ok);
			assertEq(nonceOf(account), i + 1);
			assertEq(bcs(account).nonce(), i + 1);
			(bool replay, ) = exec(account, calls, deadline, sig);
			assertFalse(replay);
		}
		assertEq(token.balanceOf(payee), uint256(rounds) * 1e18);
	}

	function test_P5_emptyBatchConsumesNonce() public {
		// Signing an empty batch is how an account voids a batch it signed but no longer wants relayed.
		BatchCallAndSponsor.Call[] memory pending = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory pendingSig = signBatch(accountPk, account, pending, deadline);
		BatchCallAndSponsor.Call[] memory empty = new BatchCallAndSponsor.Call[](0);
		(bool ok, ) = exec(account, empty, deadline, signBatch(accountPk, account, empty, deadline));
		assertTrue(ok);
		(ok, ) = exec(account, pending, deadline, pendingSig);
		assertFalse(ok);
	}

	/* ==================================================================================== P6 */

	function test_P6_failingCallRevertsWholeBatch() public {
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](3);
		calls[0] = BatchCallAndSponsor.Call(address(token), 0, abi.encodeCall(token.transfer, (payee, 3e18)));
		calls[1] = BatchCallAndSponsor.Call(address(recorder), 1 ether, abi.encodeCall(Recorder.record, ('a')));
		calls[2] = BatchCallAndSponsor.Call(address(reverter), 0, abi.encodeCall(Reverter.fail, (7)));
		uint256 deadline = block.timestamp + 60;
		(bool ok, bytes memory ret) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		assertFalse(ok);
		assertEq(
			ret,
			abi.encodeWithSelector(
				BatchCallAndSponsor.CallReverted.selector,
				2,
				abi.encodeWithSelector(Reverter.Nope.selector, 7)
			)
		);
		assertEq(token.balanceOf(payee), 0);
		assertEq(recorder.calls(), 0);
		assertEq(account.balance, 10 ether);
		assertEq(nonceOf(account), 0);
	}

	function test_P6_plainRevertAndUnaffordableValue() public {
		BatchCallAndSponsor.Call[] memory calls = one(address(reverter), 0, abi.encodeCall(Reverter.failPlain, ()));
		uint256 deadline = block.timestamp + 60;
		(bool ok, bytes memory ret) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(BatchCallAndSponsor.CallReverted.selector, 0, ''));
		// More ETH than the account holds: the call fails, the batch reverts, the nonce stays.
		calls = one(address(recorder), 11 ether, abi.encodeCall(Recorder.record, ('x')));
		(ok, ) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		assertFalse(ok);
		assertEq(nonceOf(account), 0);
	}

	/* ==================================================================================== P7 */

	function testFuzz_P7_anyChangeInvalidates(uint8 field, address to, uint256 value, bytes memory data, uint256 deadlineShift) public {
		field = uint8(bound(field, 0, 5));
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](2);
		calls[0] = BatchCallAndSponsor.Call(address(recorder), 0, abi.encodeCall(Recorder.record, ('one')));
		calls[1] = BatchCallAndSponsor.Call(address(token), 0, abi.encodeCall(token.transfer, (payee, 1e18)));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);

		BatchCallAndSponsor.Call[] memory changed = calls;
		uint256 changedDeadline = deadline;
		if (field == 0) {
			vm.assume(to != calls[0].to);
			changed[0].to = to;
		} else if (field == 1) {
			vm.assume(value != 0);
			changed[0].value = value;
		} else if (field == 2) {
			vm.assume(keccak256(data) != keccak256(calls[0].data));
			changed[0].data = data;
		} else if (field == 3) {
			changed = new BatchCallAndSponsor.Call[](2);
			changed[0] = calls[1];
			changed[1] = calls[0];
		} else if (field == 4) {
			changed = new BatchCallAndSponsor.Call[](1);
			changed[0] = calls[0];
		} else {
			deadlineShift = bound(deadlineShift, 1, 1e9);
			changedDeadline = deadline + deadlineShift;
		}
		(bool ok, bytes memory ret) = exec(account, changed, changedDeadline, sig);
		assertFalse(ok);
		assertEq(bytes4(ret), BatchCallAndSponsor.InvalidSignature.selector);
	}

	/* ==================================================================================== P8 */

	function test_P8_legacySignatureRejected() public {
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		bytes memory packed;
		for (uint256 i; i < calls.length; i++) {
			packed = abi.encodePacked(packed, calls[i].to, calls[i].value, calls[i].data);
		}
		bytes32 legacyDigest = keccak256(abi.encodePacked(uint256(0), packed));
		bytes32 ethSigned = keccak256(abi.encodePacked('\x19Ethereum Signed Message:\n32', legacyDigest));
		bytes memory legacySig = signDigest(accountPk, ethSigned);
		(bool ok, ) = exec(account, calls, type(uint256).max, legacySig);
		assertFalse(ok);
		assertEq(token.balanceOf(payee), 0);
	}

	function test_P8_legacyCalldataReverts() public {
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		bytes memory legacy = abi.encodeWithSignature('execute((address,uint256,bytes)[],bytes)', calls, hex'00');
		vm.prank(relayer);
		(bool ok, ) = account.call(legacy);
		assertFalse(ok, 'legacy execute must not be a silent no-op');
	}

	function testFuzz_P8_unknownSelectorReverts(bytes4 selector, bytes memory rest) public {
		vm.assume(selector != BatchCallAndSponsor.execute.selector);
		vm.assume(selector != BatchCallAndSponsor.nonce.selector);
		vm.assume(selector != BatchCallAndSponsor.domainSeparator.selector);
		vm.assume(selector != bytes4(keccak256('CALL_TYPEHASH()')));
		vm.assume(selector != bytes4(keccak256('EXECUTE_TYPEHASH()')));
		(bool ok, ) = account.call(abi.encodePacked(selector, rest));
		assertFalse(ok);
	}

	/* ==================================================================================== P9 */

	function test_P9_executeWritesOnlyTheNonceSlot() public {
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](2);
		calls[0] = BatchCallAndSponsor.Call(address(token), 0, abi.encodeCall(token.transfer, (payee, 1e18)));
		calls[1] = BatchCallAndSponsor.Call(address(recorder), 1 wei, abi.encodeCall(Recorder.record, ('s')));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		vm.record();
		(bool ok, ) = exec(account, calls, deadline, sig);
		assertTrue(ok);
		(, bytes32[] memory writes) = vm.accesses(account);
		assertEq(writes.length, 1);
		assertEq(writes[0], NONCE_SLOT);
	}

	function testFuzz_P9_nonceViewReadsTheSlot(uint256 stored) public {
		vm.store(account, NONCE_SLOT, bytes32(stored));
		assertEq(bcs(account).nonce(), stored);
	}

	/* ==================================================================================== P10 */

	function test_P10_valueForwardedAndMsgValueKept() public {
		BatchCallAndSponsor.Call[] memory calls = one(address(recorder), 2 ether, abi.encodeCall(Recorder.record, ('v')));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		vm.deal(relayer, 1 ether);
		vm.prank(relayer);
		bcs(account).execute{value: 0.5 ether}(calls, deadline, sig);
		assertEq(address(recorder).balance, 2 ether);
		assertEq(recorder.lastValue(), 2 ether);
		assertEq(recorder.lastSender(), account);
		assertEq(account.balance, 10 ether + 0.5 ether - 2 ether);
	}

	function testFuzz_P10_plainEthReceiveWorks(uint96 amount) public {
		vm.deal(address(this), amount);
		(bool ok, ) = payable(account).call{value: amount}('');
		assertTrue(ok);
		assertEq(account.balance, 10 ether + uint256(amount));
	}

	/* ==================================================================================== P11 */

	function test_P11_batchCannotReplayItself() public {
		Reentrant attacker = new Reentrant();
		BatchCallAndSponsor.Call[] memory calls = one(address(attacker), 0, abi.encodeCall(Reentrant.poke, ()));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		attacker.arm(account, abi.encodeCall(BatchCallAndSponsor.execute, (calls, deadline, sig)));
		(bool ok, ) = exec(account, calls, deadline, sig);
		assertTrue(ok);
		assertTrue(attacker.reentered());
		assertFalse(attacker.reentryOk(), 'the same signature ran twice');
		assertEq(nonceOf(account), 1);
	}

	function test_P11_otherBatchForSameNonceCannotRunInside() public {
		Reentrant attacker = new Reentrant();
		BatchCallAndSponsor.Call[] memory drain = tokenTransfer(address(attacker), 500e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory drainSig = signBatch(accountPk, account, drain, deadline); // also signed for nonce 0
		attacker.arm(account, abi.encodeCall(BatchCallAndSponsor.execute, (drain, deadline, drainSig)));
		BatchCallAndSponsor.Call[] memory calls = one(address(attacker), 0, abi.encodeCall(Reentrant.poke, ()));
		(bool ok, ) = exec(account, calls, deadline, signBatch(accountPk, account, calls, deadline));
		assertTrue(ok);
		assertFalse(attacker.reentryOk());
		assertEq(token.balanceOf(address(attacker)), 0);
	}

	/* ==================================================================================== P12 */

	function test_P12_highSRejected() public {
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(accountPk, digest(account, calls, 0, deadline));
		// (r, n - s, v ^ 1) is the other valid ecrecover encoding of the same signature.
		bytes32 highS = bytes32(SECP256K1_ORDER - uint256(s));
		uint8 flipped = v == 27 ? 28 : 27;
		assertEq(ecrecover(digest(account, calls, 0, deadline), flipped, r, highS), account, 'precondition');
		(bool ok, bytes memory ret) = exec(account, calls, deadline, abi.encodePacked(r, highS, flipped));
		assertFalse(ok);
		assertEq(bytes4(ret), BatchCallAndSponsor.InvalidSignature.selector);
		(ok, ) = exec(account, calls, deadline, abi.encodePacked(r, s, v));
		assertTrue(ok);
	}

	function testFuzz_P12_badVRejected(uint8 v) public {
		vm.assume(v != 27 && v != 28);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		(, bytes32 r, bytes32 s) = vm.sign(accountPk, digest(account, calls, 0, deadline));
		(bool ok, ) = exec(account, calls, deadline, abi.encodePacked(r, s, v));
		assertFalse(ok);
	}

	function testFuzz_P12_wrongLengthRejected(uint8 len) public {
		vm.assume(len != 65);
		BatchCallAndSponsor.Call[] memory calls = tokenTransfer(payee, 1e18);
		uint256 deadline = block.timestamp + 60;
		bytes memory good = signBatch(accountPk, account, calls, deadline);
		bytes memory sig = new bytes(len);
		for (uint256 i; i < len && i < 65; i++) sig[i] = good[i];
		(bool ok, bytes memory ret) = exec(account, calls, deadline, sig);
		assertFalse(ok);
		assertEq(bytes4(ret), BatchCallAndSponsor.InvalidSignature.selector);
	}

	/* ==================================================================================== P13 */

	function testFuzz_P13_domainSeparatorPerChainAndAccount(uint64 chainId) public {
		vm.assume(chainId != 0);
		vm.chainId(chainId);
		assertEq(bcs(account).domainSeparator(), domainSeparatorFor(chainId, account));
		assertEq(bcs(other).domainSeparator(), domainSeparatorFor(chainId, other));
		assertEq(impl.domainSeparator(), domainSeparatorFor(chainId, address(impl)));
	}

	function test_P13_typehashes() public view {
		assertEq(impl.CALL_TYPEHASH(), keccak256('Call(address to,uint256 value,bytes data)'));
		assertEq(
			impl.EXECUTE_TYPEHASH(),
			keccak256('Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)')
		);
		assertEq(impl.CALL_TYPEHASH(), 0x9085b19ea56248c94d86174b3784cfaaa8673d1041d6441f61ff52752dac8483);
		assertEq(impl.EXECUTE_TYPEHASH(), 0xb6eb2e6bd4dd2620d8f857bdfd6d6e6c24a1ecb8eef11147e4d521bea98da658);
		assertEq(
			NONCE_SLOT,
			keccak256(abi.encode(uint256(keccak256('paycrest.storage.BatchCallAndSponsor')) - 1)) & ~bytes32(uint256(0xff))
		);
	}

	/// Pins the digest an off-chain signer (the aggregator, ethers' TypedDataEncoder) computes for a fixed batch.
	function test_P13_referenceDigest() public pure {
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](1);
		calls[0] = BatchCallAndSponsor.Call(
			0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
			0,
			hex'a9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000bebc200'
		);
		bytes32 d = digestFor(8453, 0x1111111111111111111111111111111111111111, calls, 7, 1_800_000_000);
		assertEq(d, 0xc063d70837d6c9fbedfc0a5dca0503e34ab07ca8c4417043c515bf67558a7f3d);
	}

	/* ==================================================================================== P14 */

	function test_P14_events() public {
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](2);
		calls[0] = BatchCallAndSponsor.Call(address(recorder), 1, abi.encodeCall(Recorder.record, ('e1')));
		calls[1] = BatchCallAndSponsor.Call(address(token), 0, abi.encodeCall(token.transfer, (payee, 1)));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signBatch(accountPk, account, calls, deadline);
		vm.expectEmit(true, true, false, true, account);
		emit CallExecuted(relayer, calls[0].to, calls[0].value, calls[0].data);
		vm.expectEmit(true, true, false, true, account);
		emit CallExecuted(relayer, calls[1].to, calls[1].value, calls[1].data);
		vm.expectEmit(true, false, false, true, account);
		emit BatchExecuted(0, calls);
		(bool ok, ) = exec(account, calls, deadline, sig);
		assertTrue(ok);
	}
}
