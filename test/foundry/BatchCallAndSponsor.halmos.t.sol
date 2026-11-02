// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {BatchCallAndSponsor} from '../../contracts/BatchCallAndSponsor.sol';
import {BatchCallAndSponsorBase, Recorder, Reverter} from './BatchCallAndSponsorBase.sol';

/**
 * @title BatchCallAndSponsorHalmos
 * @notice Bounded symbolic checks: Halmos runs every `check_` function for all inputs. Each check states a
 * property as "if the call succeeded then <condition>" (or "the call never succeeds"), over a symbolic signing
 * key, deadline, chain id, timestamp or storage slot. Halmos models `vm.sign`/`ecrecover` so a signature only
 * validates for `vm.addr(pk)` and the digest it was made over.
 *
 * Replay properties (P2, P3, P5, P7) are proved in two parts, as Halmos cannot carry the second: (a) the
 * Execute digest binds the field in question — a different chain id, account, nonce, deadline or call gives a
 * different digest (Halmos treats keccak256 as collision-free); (b) a batch executes only with the account's
 * signature over the digest the contract computes (P1). Halmos models `ecrecover` on a digest other than the
 * one signed as unconstrained, so "a signature over digest A does not verify for digest B" is the standard ECDSA
 * unforgeability assumption, not something this suite proves; the Foundry tests exercise it with real keys.
 *
 * Fixture: the delegate's code is etched at a concrete EOA address (`account`), as an EIP-7702 delegation would
 * place it; the account's key is the symbolic `pk` of each check, so "the account signed" is `vm.addr(pk) ==
 * account`. Call arrays are concrete (one or two calls) to keep paths bounded.
 */
contract BatchCallAndSponsorHalmos is BatchCallAndSponsorBase {
	function setUp() public override {
		// Halmos models vm.addr as an uninterpreted function: pin the account to a concrete address instead of
		// deriving it from a key, so a check's `vm.addr(pk) == account` is satisfiable exactly for its key.
		impl = new BatchCallAndSponsor();
		account = address(uint160(0xACC0));
		vm.etch(account, address(impl).code);
		vm.deal(account, 10 ether);
		recorder = new Recorder();
		reverter = new Reverter();
		relayer = address(uint160(0x5e1a));
		vm.warp(1_800_000_000);
	}

	/// @dev Fix a representative encoding (`v == 27`, low `s`), as the OTC suite does: Halmos keeps `v` symbolic
	/// and would otherwise fork inside ecrecover; malleability is checked separately (P12).
	function signDigest(uint256 pk, bytes32 d) internal pure override returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
		vm.assume(uint256(s) <= HALF_ORDER && v == 27);
		vm.assume(vm.addr(pk) != address(0));
		return abi.encodePacked(r, s, v);
	}

	function _validPk(uint256 pk) internal pure {
		vm.assume(pk > 0 && pk < SECP256K1_ORDER);
	}

	function _recordCall(bytes memory tag) internal view returns (BatchCallAndSponsor.Call[] memory) {
		return one(address(recorder), 0, abi.encodeCall(Recorder.record, (tag)));
	}

	/* ==================================================================================== P1 */

	/// A batch executes only if the account itself signed it.
	function check_P1_onlyAccountSignatureExecutes(uint256 pk, uint256 deadline) public {
		_validPk(pk);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p1');
		bytes memory sig = signDigest(pk, digest(account, calls, 0, deadline));
		(bool ok, ) = exec(account, calls, deadline, sig);
		assert(!ok || vm.addr(pk) == account);
	}

	/// Arbitrary signature bytes (not produced by any signing) never execute unless they are the account's.
	function check_P1_arbitraryBytesNeedTheAccount(bytes32 r, bytes32 s, uint8 v) public {
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p1b');
		bytes32 d = digest(account, calls, 0, block.timestamp);
		(bool ok, ) = exec(account, calls, block.timestamp, abi.encodePacked(r, s, v));
		assert(!ok || ecrecover(d, v, r, s) == account);
	}

	/* ==================================================================================== P2 */

	/// The digest binds the chain id: signatures for another chain are over a different digest.
	function check_P2_digestBindsChainId(uint256 chainA, uint256 chainB, uint256 n, uint256 deadline) public view {
		vm.assume(chainA != chainB);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p2');
		assert(digestFor(chainA, account, calls, n, deadline) != digestFor(chainB, account, calls, n, deadline));
	}

	/* ==================================================================================== P3 */

	/// The digest binds the account (verifyingContract): a signature for another account is over another digest.
	function check_P3_digestBindsAccount(address a, address b, uint256 n, uint256 deadline) public view {
		vm.assume(a != b);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p3');
		assert(digestFor(block.chainid, a, calls, n, deadline) != digestFor(block.chainid, b, calls, n, deadline));
	}

	/// A normally deployed instance executes only for a key whose address is the instance's own address.
	function check_P3_deployedInstanceNeedsItsOwnKey(uint256 pk, uint256 deadline) public {
		_validPk(pk);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p3i');
		bytes memory sig = signDigest(pk, digest(address(impl), calls, 0, deadline));
		(bool ok, ) = exec(address(impl), calls, deadline, sig);
		assert(!ok || vm.addr(pk) == address(impl));
	}

	/* ==================================================================================== P4 */

	/// Whatever the signature, nothing executes after its deadline.
	function check_P4_nothingAfterDeadline(uint256 pk, uint256 deadline, uint32 dt) public {
		_validPk(pk);
		vm.warp(block.timestamp + dt);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p4');
		bytes memory sig = signDigest(pk, digest(account, calls, 0, deadline));
		(bool ok, ) = exec(account, calls, deadline, sig);
		assert(!ok || block.timestamp <= deadline);
	}

	/* ==================================================================================== P5 */

	/// A successful batch steps the nonce by exactly one; a failed one leaves it unchanged.
	function check_P5_nonceStepsByOne(uint256 pk, uint256 start) public {
		_validPk(pk);
		vm.assume(start < type(uint128).max);
		vm.store(account, NONCE_SLOT, bytes32(start));
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p5');
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(pk, digest(account, calls, start, deadline));
		(bool ok, ) = exec(account, calls, deadline, sig);
		assert(uint256(vm.load(account, NONCE_SLOT)) == (ok ? start + 1 : start));
	}

	/// The digest binds the nonce: once the nonce moves, a used signature is over a stale digest.
	function check_P5_digestBindsNonce(uint256 n1, uint256 n2, uint256 deadline) public view {
		vm.assume(n1 != n2);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p5d');
		assert(digest(account, calls, n1, deadline) != digest(account, calls, n2, deadline));
	}

	/* ==================================================================================== P6 */

	/// A batch containing a failing call never succeeds and leaves the nonce and earlier calls' effects unchanged.
	function check_P6_failingCallRevertsEverything(uint256 pk, uint256 code) public {
		_validPk(pk);
		BatchCallAndSponsor.Call[] memory calls = new BatchCallAndSponsor.Call[](2);
		calls[0] = BatchCallAndSponsor.Call(address(recorder), 1 ether, abi.encodeCall(Recorder.record, ('p6')));
		calls[1] = BatchCallAndSponsor.Call(address(reverter), 0, abi.encodeCall(Reverter.fail, (code)));
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(pk, digest(account, calls, 0, deadline));
		(bool ok, ) = exec(account, calls, deadline, sig);
		assert(!ok);
		assert(uint256(vm.load(account, NONCE_SLOT)) == 0);
		assert(recorder.calls() == 0);
		assert(account.balance == 10 ether);
	}

	/* ==================================================================================== P7 */

	/// The digest binds every signed field of a call and the deadline.
	function check_P7_digestBindsCallsAndDeadline(
		address to1,
		uint256 value1,
		bytes32 data1,
		uint256 deadline1,
		address to2,
		uint256 value2,
		bytes32 data2,
		uint256 deadline2
	) public view {
		vm.assume(to1 != to2 || value1 != value2 || data1 != data2 || deadline1 != deadline2);
		bytes32 a = digest(account, one(to1, value1, abi.encode(data1)), 0, deadline1);
		bytes32 b = digest(account, one(to2, value2, abi.encode(data2)), 0, deadline2);
		assert(a != b);
	}

	/// The digest binds the number and order of calls.
	function check_P7_digestBindsCallOrderAndCount(address to1, address to2) public view {
		vm.assume(to1 != to2);
		BatchCallAndSponsor.Call[] memory ab = new BatchCallAndSponsor.Call[](2);
		ab[0] = BatchCallAndSponsor.Call(to1, 0, '');
		ab[1] = BatchCallAndSponsor.Call(to2, 0, '');
		BatchCallAndSponsor.Call[] memory ba = new BatchCallAndSponsor.Call[](2);
		ba[0] = ab[1];
		ba[1] = ab[0];
		BatchCallAndSponsor.Call[] memory a = one(to1, 0, '');
		uint256 deadline = 1;
		assert(digest(account, ab, 0, deadline) != digest(account, ba, 0, deadline));
		assert(digest(account, ab, 0, deadline) != digest(account, a, 0, deadline));
	}

	/* ==================================================================================== P8 */

	/// No selector other than the delegate's own functions succeeds on the account (no fallback).
	function check_P8_unknownSelectorReverts(bytes4 selector, bytes32 arg) public {
		vm.assume(selector != BatchCallAndSponsor.execute.selector);
		vm.assume(selector != BatchCallAndSponsor.nonce.selector);
		vm.assume(selector != BatchCallAndSponsor.domainSeparator.selector);
		vm.assume(selector != bytes4(keccak256('CALL_TYPEHASH()')));
		vm.assume(selector != bytes4(keccak256('EXECUTE_TYPEHASH()')));
		(bool ok, ) = account.call(abi.encodePacked(selector, arg));
		assert(!ok);
	}

	/* ==================================================================================== P9 */

	/// execute leaves the account's other storage unchanged: slot 0, a mapping-style hashed slot, the slots next
	/// to the nonce, and another namespace's ERC-7201 base, each holding a symbolic value.
	function check_P9_onlyNonceSlotChanges(uint256 pk, bytes32 v0, bytes32 v1, bytes32 v2, bytes32 v3, bytes32 v4) public {
		_validPk(pk);
		bytes32[5] memory slots = [
			bytes32(0),
			keccak256(abi.encode(address(0xBEEF), uint256(0))),
			bytes32(uint256(NONCE_SLOT) + 1),
			bytes32(uint256(NONCE_SLOT) - 1),
			bytes32(0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300)
		];
		bytes32[5] memory values = [v0, v1, v2, v3, v4];
		for (uint256 i; i < 5; i++) vm.store(account, slots[i], values[i]);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p9');
		uint256 deadline = block.timestamp + 60;
		bytes memory sig = signDigest(pk, digest(account, calls, 0, deadline));
		exec(account, calls, deadline, sig);
		for (uint256 i; i < 5; i++) assert(vm.load(account, slots[i]) == values[i]);
	}

	/* ==================================================================================== P12 */

	/// The high-s twin of any signature is rejected before recovery.
	function check_P12_highSNeverExecutes(bytes32 r, bytes32 s, uint8 v) public {
		vm.assume(uint256(s) > HALF_ORDER);
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p12');
		(bool ok, ) = exec(account, calls, block.timestamp, abi.encodePacked(r, s, v));
		assert(!ok);
	}

	/// Signatures of any length other than 65 bytes are rejected.
	function check_P12_wrongLengthNeverExecutes(bytes32 a, bytes32 b, bytes32 c) public {
		BatchCallAndSponsor.Call[] memory calls = _recordCall('p12l');
		(bool ok64, ) = exec(account, calls, block.timestamp, abi.encodePacked(a, b));
		(bool ok66, ) = exec(account, calls, block.timestamp, abi.encodePacked(a, b, bytes2(c)));
		(bool ok96, ) = exec(account, calls, block.timestamp, abi.encodePacked(a, b, c));
		assert(!ok64 && !ok66 && !ok96);
	}

	/* ==================================================================================== P13 */

	/// domainSeparator() is the EIP-712 domain of this account on the current chain, for every chain id.
	function check_P13_domainSeparator(uint64 chainId) public {
		vm.chainId(chainId);
		assert(BatchCallAndSponsor(payable(account)).domainSeparator() == domainSeparatorFor(chainId, account));
	}
}
