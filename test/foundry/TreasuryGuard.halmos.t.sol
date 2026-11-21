// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import 'forge-std/Test.sol';
import {TreasuryGuard} from '../../contracts/TreasuryGuard.sol';
import {ISafeGuard, IERC165, Operation} from '../../contracts/interfaces/ISafe.sol';

/**
 * @title TreasuryGuardHalmos
 * @notice Bounded symbolic checks of `TreasuryGuard`: Halmos runs every `check_` function for all inputs.
 *
 * The test contract plays the Safe (`msg.sender` of the guard): its threshold, nonce and owner answer are
 * symbolic storage, and `getTransactionHash` hashes the ten fields it receives (with `data` replaced by its
 * hash, like Safe). Signatures are symbolic 65-byte parts. Halmos models `ecrecover` as an uninterpreted
 * function, so "signer i is the co-signer" is a free choice of the solver unless the property pins it; checks
 * compare the guard's verdict with a plain-Solidity reference of Safe's owner-identification rules. The
 * deadline attestation (the last 97 bytes) is symbolic too; "it is the co-signer's, for this transaction, and not
 * expired" is part of each reference verdict, so every check also covers P15 and P16.
 *
 * What the Foundry suite covers instead: the real Safe's own signature check (Halmos can't run the deployed
 * bytecode with symbolic signatures in reasonable time), and that the real Safe's `getTransactionHash` agrees
 * with the guard (differential fuzz, P4).
 */
contract TreasuryGuardHalmos is Test {
	TreasuryGuard internal guard;
	address internal constant COSIGNER = address(0xC0516);
	bytes4 internal constant GUARD_ID = 0xe6d7a83a;

	uint256 internal threshold;
	uint256 internal safeNonce;
	bool internal ownerAnswer;

	function setUp() public {
		guard = new TreasuryGuard();
		ownerAnswer = true;
		threshold = 2;
		safeNonce = 1;
	}

	/* ------------------------------------------------------------------ the Safe the guard sees */

	function getThreshold() external view returns (uint256) {
		return threshold;
	}

	function nonce() external view returns (uint256) {
		return safeNonce;
	}

	function isOwner(address) external view returns (bool) {
		return ownerAnswer;
	}

	/// keccak256 of the ten head words, with word 2 (`data`'s offset) replaced by keccak256(data).
	function getTransactionHash(
		address,
		uint256,
		bytes calldata,
		Operation,
		uint256,
		uint256,
		uint256,
		address,
		address,
		uint256
	) external pure returns (bytes32 h) {
		// solhint-disable-next-line no-inline-assembly
		assembly {
			let p := mload(0x40)
			for {
				let i := 0
			} lt(i, 10) {
				i := add(i, 1)
			} {
				mstore(add(p, mul(i, 0x20)), calldataload(add(4, mul(i, 0x20))))
			}
			let off := calldataload(0x44)
			let len := calldataload(add(4, off))
			calldatacopy(add(p, 0x140), add(add(4, off), 0x20), len)
			mstore(add(p, 0x40), keccak256(add(p, 0x140), len))
			h := keccak256(p, 0x140)
		}
	}

	/* ------------------------------------------------------------------ helpers */

	/// One 65-byte signature part.
	struct Part {
		bytes32 r;
		bytes32 s;
		uint8 v;
	}

	/// The deadline attestation at the end of `signatures`.
	struct Att {
		uint256 deadline;
		bytes32 r;
		bytes32 s;
		uint8 v;
	}

	function _p(Part memory x) internal pure returns (bytes memory) {
		return bytes.concat(x.r, x.s, bytes1(x.v));
	}

	function _tail(Att memory a) internal pure returns (bytes memory) {
		return bytes.concat(bytes32(a.deadline), a.r, a.s, bytes1(a.v));
	}

	/// Reference for P15 + P16: the attestation is the co-signer's over this transaction's hash, not expired.
	function _attested(bytes32 h, Att memory a) internal view returns (bool) {
		bytes32 digest = keccak256(abi.encode(keccak256('TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)'), h, a.deadline));
		return ecrecover(digest, a.v, a.r, a.s) == COSIGNER && block.timestamp <= a.deadline;
	}

	/// An approved-hash part for a fixed owner that is not the co-signer.
	function _otherOwner() internal pure returns (bytes memory) {
		return bytes.concat(bytes32(uint256(0x1234)), bytes32(0), bytes1(0x01));
	}

	/// An approved-hash part naming the co-signer (counted without any ECDSA).
	function _cosignerApproved() internal pure returns (bytes memory) {
		return bytes.concat(bytes32(uint256(uint160(COSIGNER))), bytes32(0), bytes1(0x01));
	}

	function _register() internal {
		guard.setCosigner(COSIGNER);
	}

	/// The hash the guard must check for `to/value/data` with zero gas fields at nonce `n`.
	function _expected(address to, uint256 value, bytes memory data, uint256 n) internal pure returns (bytes32) {
		return keccak256(abi.encode(to, value, keccak256(data), uint256(0), uint256(0), uint256(0), uint256(0), address(0), address(0), n));
	}

	function _call(address to, uint256 value, bytes memory data, bytes memory sigs) internal returns (bool ok) {
		(ok, ) = address(guard).call(
			abi.encodeCall(TreasuryGuard.checkTransaction, (to, value, data, Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs, address(0)))
		);
	}

	/// Safe's owner-identification rule for one 65-byte part.
	function _owner(bytes32 h, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
		if (v == 0 || v == 1) return address(uint160(uint256(r)));
		if (v > 30) return ecrecover(keccak256(abi.encodePacked('\x19Ethereum Signed Message:\n32', h)), v - 4, r, s);
		return ecrecover(h, v, r, s);
	}

	/* ==================================================================================== P1 */

	/// The guard passes exactly when one of the first `threshold` parts is the co-signer's and the attestation
	/// holds (threshold 2 or 3, three parts supplied).
	function check_P1_passesIffCosignerCounted(uint256 t, Part memory p0, Part memory p1, Part memory p2, Att memory a, uint256 ts) public {
		vm.assume(t == 2 || t == 3);
		vm.warp(ts);
		threshold = t;
		_register();
		bytes memory sigs = bytes.concat(_p(p0), _p(p1), _p(p2), _tail(a));
		bytes32 h = _expected(address(0xBEEF), 1, '', safeNonce - 1);
		bool counted = _owner(h, p0.v, p0.r, p0.s) == COSIGNER ||
			_owner(h, p1.v, p1.r, p1.s) == COSIGNER ||
			(t == 3 && _owner(h, p2.v, p2.r, p2.s) == COSIGNER);
		assertEq(_call(address(0xBEEF), 1, '', sigs), counted && _attested(h, a));
	}

	/* ==================================================================================== P2 */

	/// A threshold below 2 always fails, whatever the signatures.
	function check_P2_thresholdBelowTwoAlwaysFails(uint256 t, bytes32 r, bytes32 s, uint8 v) public {
		_register();
		vm.assume(t < 2);
		threshold = t;
		assertFalse(_call(address(0xBEEF), 0, '', bytes.concat(r, s, bytes1(v), r, s, bytes1(v))));
	}

	/* ==================================================================================== P3 */

	/// Parts after the first `threshold` (before the attestation) never change the verdict.
	function check_P3_extraPartsIgnored(Part memory p0, Part memory p1, Part memory px, Att memory att) public {
		_register();
		bytes memory counted = bytes.concat(_p(p0), _p(p1));
		bool a = _call(address(0xBEEF), 0, '', bytes.concat(counted, _tail(att)));
		bool b = _call(address(0xBEEF), 0, '', bytes.concat(counted, _p(px), _tail(att)));
		assertEq(a, b);
		// In particular an appended v == 1 part naming the co-signer.
		bool c = _call(address(0xBEEF), 0, '', bytes.concat(counted, _cosignerApproved(), _tail(att)));
		assertEq(a, c);
	}

	/* ==================================================================================== P4 */

	/// An ECDSA co-signature, and the attestation, only count if they are for the Safe's hash of this
	/// transaction at `nonce - 1`.
	function check_P4_cosignatureBoundToTransaction(address to, uint256 value, bytes32 word, uint256 n, Part memory c, Att memory a) public {
		vm.assume(n > 0);
		vm.assume(c.v == 27 || c.v == 28);
		safeNonce = n;
		_register();
		bytes memory data = abi.encodePacked(word);
		// Second part: an approved-hash entry for some non-co-signer owner, so only the first part can satisfy.
		bytes memory sigs = bytes.concat(_p(c), _otherOwner(), _tail(a));
		if (_call(to, value, data, sigs)) {
			bytes32 h = _expected(to, value, data, n - 1);
			assertEq(ecrecover(h, c.v, c.r, c.s), COSIGNER);
			assertTrue(_attested(h, a));
		}
	}

	/* ==================================================================================== P5 */

	/// Without a registered co-signer, nothing passes.
	function check_P5_unregisteredAlwaysFails(uint256 t, bytes32 r, bytes32 s, uint8 v) public {
		threshold = t;
		bytes memory sigs = bytes.concat(bytes32(uint256(uint160(COSIGNER))), bytes32(0), bytes1(0x01), r, s, bytes1(v));
		assertFalse(_call(address(0xBEEF), 0, '', sigs));
	}

	/* ==================================================================================== P6 */

	/// `setCosigner` writes only the caller's own entry, and only for a non-zero owner.
	function check_P6_registersOnlyCallersEntry(address c, address other, bool isOwnerAnswer) public {
		vm.assume(other != address(this));
		ownerAnswer = isOwnerAnswer;
		address before = guard.cosignerOf(other);
		(bool ok, ) = address(guard).call(abi.encodeCall(TreasuryGuard.setCosigner, (c)));
		assertEq(ok, c != address(0) && isOwnerAnswer);
		if (ok) assertEq(guard.cosignerOf(address(this)), c);
		else assertEq(guard.cosignerOf(address(this)), address(0));
		assertEq(guard.cosignerOf(other), before);
	}

	/* ==================================================================================== P8 */

	function check_P8_supportsInterface(bytes4 id) public view {
		assertEq(guard.supportsInterface(id), id == GUARD_ID || id == type(IERC165).interfaceId);
		assertEq(type(ISafeGuard).interfaceId, GUARD_ID);
	}

	/* ==================================================================================== P9 */

	/// `checkTransaction` and `checkAfterExecution` never write storage: their verdict under STATICCALL (where
	/// any write fails) equals the verdict under a plain call, and the registered entries are unchanged.
	function check_P9_hooksWriteNothing(address other, bytes32 r, bytes32 s, uint8 v, bytes32 txHash, bool success) public {
		_register();
		address mine = guard.cosignerOf(address(this));
		address theirs = guard.cosignerOf(other);
		bytes memory sigs = bytes.concat(r, s, bytes1(v), r, s, bytes1(v));
		bytes memory cd = abi.encodeCall(
			TreasuryGuard.checkTransaction,
			(address(0xBEEF), 0, '', Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs, address(0))
		);
		(bool viaStatic, ) = address(guard).staticcall(cd);
		(bool viaCall, ) = address(guard).call(cd);
		assertEq(viaStatic, viaCall);
		(bool afterOk, ) = address(guard).staticcall(abi.encodeCall(TreasuryGuard.checkAfterExecution, (txHash, success)));
		assertTrue(afterOk);
		assertEq(guard.cosignerOf(address(this)), mine);
		assertEq(guard.cosignerOf(other), theirs);
	}

	/* ==================================================================================== P10 */

	/// A contract-signature part (v == 0) is identified by `r`: it counts for the co-signer only if `r` is the
	/// co-signer.
	function check_P10_contractPartIdentifiedByR(bytes32 r, bytes32 s, bytes32 r1, bytes32 s1, Att memory a) public {
		_register();
		// Second part: approved hash for a fixed non-co-signer, so the verdict depends on the first part only.
		bool ok = _call(address(0xBEEF), 0, '', bytes.concat(r, s, bytes1(0), r1, s1, bytes1(0x01), _tail(a)));
		vm.assume(address(uint160(uint256(r1))) != COSIGNER);
		bytes32 h = _expected(address(0xBEEF), 0, '', safeNonce - 1);
		assertEq(ok, address(uint160(uint256(r))) == COSIGNER && _attested(h, a));
	}

	/* ==================================================================================== P15 */

	/// With the co-signer counted, the verdict is exactly "the attestation is valid and not expired", at any
	/// block time; in particular nothing passes once `block.timestamp > deadline`.
	function check_P15_expiredNeverPasses(uint256 ts, Att memory a) public {
		vm.warp(ts);
		_register();
		bytes memory sigs = bytes.concat(_cosignerApproved(), _otherOwner(), _tail(a));
		bool ok = _call(address(0xBEEF), 0, '', sigs);
		assertEq(ok, _attested(_expected(address(0xBEEF), 0, '', safeNonce - 1), a));
		if (ts > a.deadline) assertFalse(ok);
	}

	/* ==================================================================================== P16 */

	/// Fewer than 97 bytes after the counted parts never pass, whatever they hold (threshold 2: 2 parts and 96
	/// bytes; threshold 3: 3 parts and 96 bytes).
	function check_P16_missingAttestationFails(bool three, bytes32 x0, bytes32 x1, bytes32 x2) public {
		_register();
		threshold = three ? 3 : 2;
		bytes memory parts = three ? bytes.concat(_cosignerApproved(), _otherOwner(), _otherOwner()) : bytes.concat(_cosignerApproved(), _otherOwner());
		assertFalse(_call(address(0xBEEF), 0, '', bytes.concat(parts, x0, x1, x2)));
	}

	/// A passing attestation is the co-signer's for this transaction at `nonce - 1`: one made for any other
	/// transaction or deadline does not verify.
	function check_P16_attestationBoundToTransaction(address to, uint256 value, bytes32 word, uint256 n, Att memory a) public {
		vm.assume(n > 0);
		safeNonce = n;
		_register();
		bytes memory data = abi.encodePacked(word);
		if (_call(to, value, data, bytes.concat(_cosignerApproved(), _otherOwner(), _tail(a)))) {
			assertTrue(_attested(_expected(to, value, data, n - 1), a));
		}
	}
}
