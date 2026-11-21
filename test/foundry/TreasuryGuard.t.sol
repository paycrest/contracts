// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import '@openzeppelin/contracts/proxy/Clones.sol';
import '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import {TreasuryGuard} from '../../contracts/TreasuryGuard.sol';
import {TreasurySetup} from '../../contracts/TreasurySetup.sol';
import {ISafeSetup, ISafeView, ISafeGuard, IERC165, IDelay, Operation} from '../../contracts/interfaces/ISafe.sol';
import {TreasuryBase, ISafe, MockPasskey, TestToken} from './TreasuryBase.sol';
import {stdError} from 'forge-std/StdError.sol';

/// @notice A contract that registers a co-signer but is not a Safe: it has no (or a broken) getTransactionHash.
contract FakeSafe {
	uint256 public nonce = 1;
	uint256 public threshold = 2;
	bytes public hashReturn;
	bool public hashReverts = true;

	function getThreshold() external view returns (uint256) {
		return threshold;
	}

	function isOwner(address) external pure returns (bool) {
		return true;
	}

	function setHashReturn(bytes memory r) external {
		hashReturn = r;
		hashReverts = false;
		revertWithWord = false;
	}

	bool public revertWithWord;

	function setRevertWithWord() external {
		revertWithWord = true;
	}

	function setThreshold(uint256 t) external {
		threshold = t;
	}

	function setNonce(uint256 n) external {
		nonce = n;
	}

	function register(TreasuryGuard g, address c) external {
		g.setCosigner(c);
	}

	function check(TreasuryGuard g, bytes memory sigs) external view {
		g.checkTransaction(address(0), 0, '', Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs, address(0));
	}

	/// `checkTransaction` with `data` moved into the head, an encoding no Safe produces: `data`'s offset (head word
	/// 2) points at head word `word`, which is set to `len` and so becomes `data`'s length. `data` then ends at
	/// byte 4 + 32 * word + 32 + len of the call.
	function checkWithDataAt(TreasuryGuard g, bytes memory sigs, uint256 word, uint256 len) external view returns (bool ok, bytes memory ret) {
		bytes memory cd = abi.encodeCall(
			TreasuryGuard.checkTransaction,
			(address(0), 0, '', Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs, address(0))
		);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			mstore(add(cd, 0x64), mul(word, 0x20))
			mstore(add(add(cd, 0x24), mul(word, 0x20)), len)
		}
		(ok, ret) = address(g).staticcall(cd);
	}

	/// When non-zero, the size the guard's getTransactionHash call may have at most.
	uint256 public maxHashCall;

	function setMaxHashCall(uint256 n) external {
		maxHashCall = n;
	}

	fallback(bytes calldata) external returns (bytes memory) {
		require(maxHashCall == 0 || msg.data.length <= maxHashCall, 'hash call too long');
		if (revertWithWord) {
			// solhint-disable-next-line no-inline-assembly
			assembly {
				mstore(0, 1)
				revert(0, 32)
			}
		}
		require(!hashReverts, 'no hash');
		return hashReturn;
	}
}

/// @notice A Delay stand-in for setup's timelock checks. It records its setup honestly and enables nothing, then
/// fails exactly one check: `lie` 0..4 misreports owner, avatar, target, cooldown or expiration; `lie` 5 reports
/// everything right but never enables the recovery Safe; `lie` 6 and 7 report a cooldown or an expiration 2^255 too
/// long (the whole word is compared, not its low bits). Every lie but 5 claims every module is enabled.
contract FakeDelay {
	uint8 internal immutable lie;
	address internal _owner;
	address internal _avatar;
	address internal _target;
	uint256 internal _cooldown;
	uint256 internal _expiration;

	constructor(uint8 lie_) {
		lie = lie_;
	}

	function setUp(bytes memory initParams) external {
		(_owner, _avatar, _target, _cooldown, _expiration) = abi.decode(initParams, (address, address, address, uint256, uint256));
	}

	function owner() external view returns (address) {
		return lie == 0 ? address(0xBAD) : _owner;
	}

	function avatar() external view returns (address) {
		return lie == 1 ? address(0xBAD) : _avatar;
	}

	function target() external view returns (address) {
		return lie == 2 ? address(0xBAD) : _target;
	}

	function txCooldown() external view returns (uint256) {
		if (lie == 6) return _cooldown + (uint256(1) << 255);
		return lie == 3 ? _cooldown - 1 : _cooldown;
	}

	function txExpiration() external view returns (uint256) {
		if (lie == 7) return _expiration + (uint256(1) << 255);
		return lie == 4 ? 0 : _expiration;
	}

	function enableModule(address) external {}

	function isModuleEnabled(address) external view returns (bool) {
		return lie != 5;
	}
}

contract TreasuryGuardTest is TreasuryBase {
	event CosignerSet(address indexed safe, address indexed cosigner);

	/* ==================================================================================== fixtures */

	/// The fixtures are the canonical Safe v1.4.1 deployments (code hashes from safe-deployments).
	function test_fixturesMatchCanonicalCodeHashes() public view {
		assertEq(keccak256(safeL2.code), 0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff, 'SafeL2');
		assertEq(keccak256(safeL1.code), 0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4, 'Safe');
		assertEq(keccak256(address(factory).code), 0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317, 'factory');
		assertEq(keccak256(fallbackHandler.code), 0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9, 'handler');
		assertEq(keccak256(multiSendCallOnly.code), 0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939, 'multisend');
	}

	/// The Delay fixture is Zodiac's canonical Delay 1.0.0 mastercopy: its creation code, with the constructor
	/// arguments the tests use, deployed through the ERC-2470 singleton factory with salt 0 (how Zodiac deployed
	/// it), lands exactly on the canonical mastercopy address. Its runtime code is pinned too.
	function test_delayFixtureIsCanonicalMastercopy() public view {
		bytes memory init = bytes.concat(
			vm.parseJsonBytes(_fixtureJson('Delay'), '.bytecode'),
			abi.encode(address(1), address(1), address(1), uint256(1), uint256(0))
		);
		address erc2470 = 0xce0042B868300000d44A59004Da54A005ffdcf9f;
		address predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), erc2470, bytes32(0), keccak256(init))))));
		assertEq(predicted, 0xD62129BF40CD1694b3d9D9847367783a1A4d5cB4, 'canonical Delay 1.0.0 mastercopy');
		assertEq(vm.parseJsonAddress(_fixtureJson('Delay'), '.canonicalAddress'), predicted);
		assertEq(keccak256(delayMastercopy.code), DELAY_RUNTIME_HASH, 'Delay runtime');
	}

	/* ==================================================================================== P1 */

	function test_P1_memberAndCosignerMoveFunds() public {
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, _transferData(recipient, 500e6), Operation.Call));
		assertEq(token.balanceOf(recipient), 500e6);
	}

	function test_P1_membersWithoutCosignerRevert() public {
		bytes memory data = _transferData(recipient, 500e6);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(address(passkey))), address(token), 0, data, Operation.Call);
		vm.expectRevert(_missing(address(treasury)));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		assertEq(token.balanceOf(recipient), 0);
	}

	/// Members alone with no room for an attestation revert `DeadlineAttestationMissing` before the co-signer check.
	function test_P1_membersWithoutRoomRevertAttestationMissingFirst() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes memory sigs = _stripAttestation(_sign(treasury, _signers(_s(member), _s(address(passkey))), address(token), 0, data, Operation.Call));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(treasury)));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
	}

	function test_P1_cosignerEthSignCounts() public {
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner, Kind.EthSign)), recipient, 1 ether, '', Operation.Call));
		assertEq(recipient.balance, 1 ether);
	}

	function test_P1_cosignerApprovedHashCounts() public {
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner, Kind.Approved)), recipient, 1 ether, '', Operation.Call));
		assertEq(recipient.balance, 1 ether);
	}

	/// The co-signer submitting the transaction itself (`v == 1`, `r` = co-signer, no prior approveHash).
	function test_P1_cosignerSubmittingCounts() public {
		bytes32 h = _hash(treasury, recipient, 1 ether, '', Operation.Call);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(memberPk, h);
		bytes memory m = bytes.concat(r, s, bytes1(v));
		bytes memory c = bytes.concat(bytes32(uint256(uint160(cosigner))), bytes32(0), bytes1(0x01));
		bytes memory sigs = bytes.concat(member < cosigner ? bytes.concat(m, c) : bytes.concat(c, m), _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL));
		vm.prank(cosigner);
		assertTrue(treasury.execTransaction(recipient, 1 ether, '', Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs));
		assertEq(recipient.balance, 1 ether);
	}

	/// Any two-or-more subset of {member, passkey, co-signer} executes exactly when it includes the co-signer.
	function testFuzz_P1_onlyCosignedSubsetsExecute(uint8 mask, uint96 amount) public {
		mask = uint8(bound(mask, 0, 7));
		uint256 amt = bound(amount, 1, 1_000_000e6);
		address[3] memory all = [member, address(passkey), cosigner];
		uint256 n;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) ++n;
		vm.assume(n >= 2);
		Signer[] memory signers = new Signer[](n);
		uint256 k;
		for (uint256 i = 0; i < 3; ++i) if (mask & (1 << i) != 0) signers[k++] = _s(all[i]);
		bytes memory data = _transferData(recipient, amt);
		bytes memory sigs = _sign(treasury, signers, address(token), 0, data, Operation.Call);
		bool withCosigner = mask & 4 != 0;
		if (!withCosigner) vm.expectRevert(_missing(address(treasury)));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		assertEq(token.balanceOf(recipient), withCosigner ? amt : 0);
	}

	/// At threshold 3 the co-signer counts wherever it sorts among the three counted parts; three members alone fail.
	function test_P1_thresholdThreeTreasury() public {
		address[] memory owners = new address[](4);
		owners[0] = member;
		owners[1] = admin1;
		owners[2] = address(passkey);
		owners[3] = cosigner;
		TreasurySetup.Config memory c = _config(_admins(), 2);
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(owners, 3, c), 82));
		vm.deal(address(t), 3 ether);
		assertTrue(_signAndExec(t, _signers(_s(member), _s(admin1), _s(cosigner)), recipient, 1 ether, '', Operation.Call));
		assertTrue(_signAndExec(t, _signers(_s(address(passkey)), _s(member), _s(cosigner)), recipient, 1 ether, '', Operation.Call));
		bytes memory sigs = _sign(t, _signers(_s(member), _s(admin1), _s(address(passkey))), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(_missing(address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, sigs);
	}

	/// At threshold 3 the guard reads all three counted parts (the co-signer sorted last still counts) and wants
	/// room for the attestation after all three.
	function test_P1_thresholdThreeReadsEveryCountedPart() public {
		address[] memory owners = new address[](3);
		uint256 found;
		for (uint256 pk = 0x5000; found < 2; ++pk) {
			address a = vm.addr(pk);
			if (a < cosigner) owners[found++] = _key(pk);
		}
		owners[2] = cosigner;
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(owners, 3, _config(_admins(), 2)), 83));
		vm.deal(address(t), 1 ether);
		bytes memory sigs = _sign(t, _signers(_s(owners[0]), _s(owners[1]), _s(cosigner)), recipient, 1 ether, '', Operation.Call);
		// One byte short of three parts plus the attestation.
		bytes memory short = new bytes(sigs.length - 1);
		for (uint256 i = 0; i < short.length; ++i) short[i] = sigs[i];
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, short);
		assertTrue(_exec(t, recipient, 1 ether, '', Operation.Call, sigs));
	}

	/// The same at threshold 4, so the guard reads `threshold` counted parts rather than a fixed number.
	function test_P1_thresholdFourReadsEveryCountedPart() public {
		address[] memory owners = new address[](4);
		uint256 found;
		for (uint256 pk = 0x6000; found < 3; ++pk) {
			address a = vm.addr(pk);
			if (a < cosigner) owners[found++] = _key(pk);
		}
		owners[3] = cosigner;
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(owners, 4, _config(_admins(), 2)), 84));
		vm.deal(address(t), 1 ether);
		Signer[] memory signers = new Signer[](4);
		for (uint256 i = 0; i < 4; ++i) signers[i] = _s(owners[i]);
		bytes memory sigs = _sign(t, signers, recipient, 1 ether, '', Operation.Call);
		bytes memory short = new bytes(sigs.length - 1);
		for (uint256 i = 0; i < short.length; ++i) short[i] = sigs[i];
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, short);
		assertTrue(_exec(t, recipient, 1 ether, '', Operation.Call, sigs));
	}

	/// Any threshold from 2 to 8 with the co-signer sorted last: one byte short is DeadlineAttestationMissing, the full
	/// set runs. The guard reads exactly `threshold` counted parts, however many that is.
	function testFuzz_P1_anyThresholdReadsEveryCountedPart(uint8 raw) public {
		uint256 n = 2 + (uint256(raw) % 7);
		address[] memory owners = new address[](n);
		uint256 found;
		for (uint256 pk = 0x7000; found < n - 1; ++pk) {
			address a = vm.addr(pk);
			if (a < cosigner) owners[found++] = _key(pk);
		}
		owners[n - 1] = cosigner;
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(owners, n, _config(_admins(), 2)), 900 + n));
		vm.deal(address(t), 1 ether);
		Signer[] memory signers = new Signer[](n);
		for (uint256 i = 0; i < n; ++i) signers[i] = _s(owners[i]);
		bytes memory sigs = _sign(t, signers, recipient, 1 ether, '', Operation.Call);
		bytes memory short = new bytes(sigs.length - 1);
		for (uint256 i = 0; i < short.length; ++i) short[i] = sigs[i];
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, short);
		assertTrue(_exec(t, recipient, 1 ether, '', Operation.Call, sigs));
	}

	/* ==================================================================================== P2 */

	/// With threshold 2, the co-signer's signature alone is not enough for Safe (GS020), let alone the guard.
	/// With its attestation appended, Safe reads the attestation as a second signature and refuses that (GS026).
	function test_P2_cosignerAloneCannotExecute() public {
		bytes memory sigs = _sign(treasury, _signers(_s(cosigner)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(bytes('GS020'));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, _stripAttestation(sigs));
		vm.expectRevert(bytes('GS026'));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);
		assertEq(recipient.balance, 0);
	}

	/// Lowering the threshold to 1 (even co-signed) freezes the normal path instead of letting one key act; the
	/// admins' recovery restores it.
	function test_P2_thresholdBelowTwoFreezesNormalPath() public {
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), address(treasury), 0, abi.encodeCall(ISafe.changeThreshold, (1)), Operation.Call));
		assertEq(treasury.getThreshold(), 1);

		bytes memory sigs = _sign(treasury, _signers(_s(cosigner)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.ThresholdTooLow.selector, 1));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);

		sigs = _sign(treasury, _signers(_s(member)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.ThresholdTooLow.selector, 1));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);

		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(treasury), 0, abi.encodeCall(ISafe.changeThreshold, (2)), Operation.Call);
		vm.warp(block.timestamp + COOLDOWN);
		delay.executeNextTx(address(treasury), 0, abi.encodeCall(ISafe.changeThreshold, (2)), Operation.Call);
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), recipient, 1 ether, '', Operation.Call));
	}

	/// A threshold-1 Safe that set the guard but registered no co-signer reverts `CosignerNotSet` first.
	function test_P2_noCosignerRevertsBeforeThreshold() public {
		address[] memory owners = new address[](2);
		owners[0] = member;
		owners[1] = cosigner;
		bytes memory init = abi.encodeCall(ISafeSetup.setup, (owners, 1, address(0), bytes(''), address(0), address(0), 0, payable(address(0))));
		ISafe plain = ISafe(factory.createProxyWithNonce(safeL2, init, 98));
		vm.deal(address(plain), 1 ether);
		assertTrue(_signAndExec(plain, _signers(_s(member)), address(plain), 0, abi.encodeCall(ISafeSetup.setGuard, (address(guard))), Operation.Call));
		bytes memory sigs = _sign(plain, _signers(_s(member)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignerNotSet.selector, address(plain)));
		_exec(plain, recipient, 1 ether, '', Operation.Call, sigs);
	}

	/* ==================================================================================== P3 */

	/// A co-signer signature appended after the `threshold` counted ones (Safe never checks it) does not count.
	function test_P3_cosignerSignatureBeyondThresholdIgnored() public {
		ISafe t = ISafe(_createTreasury(_owners3(member, admin1, cosigner), 2, _admins(), 2, 7, safeL2));
		vm.deal(address(t), 1 ether);
		bytes32 h = _hash(t, recipient, 1 ether, '', Operation.Call);
		bytes memory sigs = _stripAttestation(_sign(t, _signers(_s(member), _s(admin1)), recipient, 1 ether, '', Operation.Call));
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(cosignerPk, h);
		sigs = bytes.concat(sigs, r, s, bytes1(v), _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL));
		vm.expectRevert(_missing(address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, sigs);
	}

	/* ==================================================================================== P4 */

	struct Tx {
		address to;
		uint256 value;
		bytes data;
		Operation op;
		uint256 safeTxGas;
		uint256 baseGas;
		uint256 gasPrice;
		address gasToken;
		address refundReceiver;
	}

	function _sigsFor(bytes32 h) internal view returns (bytes memory) {
		(uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(memberPk, h);
		(uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(cosignerPk, h);
		bytes memory a = bytes.concat(r1, s1, bytes1(v1));
		bytes memory b = bytes.concat(r2, s2, bytes1(v2));
		return bytes.concat(member < cosigner ? bytes.concat(a, b) : bytes.concat(b, a), _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL));
	}

	function _safeHash(ISafe safe, Tx memory t, uint256 n) internal view returns (bytes32) {
		return safe.getTransactionHash(t.to, t.value, t.data, t.op, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, n);
	}

	function _guardCheck(ISafe safe, Tx memory t, bytes memory sigs) internal {
		vm.prank(address(safe));
		guard.checkTransaction(t.to, t.value, t.data, t.op, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, payable(t.refundReceiver), sigs, keeper);
	}

	/// Differential: for any transaction fields, the guard accepts the co-signer's signature over Safe's own hash
	/// for `nonce - 1` (the transaction in flight), and rejects it once any field differs.
	function testFuzz_P4_guardChecksSafesOwnHash(Tx memory t, uint8 field, uint256 delta) public {
		t.op = Operation(bound(uint8(t.op), 0, 1));
		delta = bound(delta, 1, type(uint64).max);
		// Advance the nonce once so `nonce - 1` exists, as it does inside execTransaction.
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), recipient, 0, '', Operation.Call));
		bytes32 h = _safeHash(treasury, t, treasury.nonce() - 1);
		_guardCheck(treasury, t, _sigsFor(h));

		field = uint8(bound(field, 0, 9));
		Tx memory u = Tx(t.to, t.value, t.data, t.op, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver);
		if (field == 0) u.to = address(uint160(t.to) ^ uint160(delta));
		else if (field == 1) u.value = t.value ^ delta;
		else if (field == 2) u.data = bytes.concat(t.data, bytes1(0x01));
		else if (field == 3) u.op = t.op == Operation.Call ? Operation.DelegateCall : Operation.Call;
		else if (field == 4) u.safeTxGas = t.safeTxGas ^ delta;
		else if (field == 5) u.baseGas = t.baseGas ^ delta;
		else if (field == 6) u.gasPrice = t.gasPrice ^ delta;
		else if (field == 7) u.gasToken = address(uint160(t.gasToken) ^ uint160(delta));
		else if (field == 8) u.refundReceiver = address(uint160(t.refundReceiver) ^ uint160(delta));
		if (field <= 8) {
			// Signatures over `t`, transaction `u`.
			vm.expectRevert(_missing(address(treasury)));
			_guardCheck(treasury, u, _sigsFor(h));
		} else {
			// Signatures over the next nonce's hash.
			bytes memory next = _sigsFor(_safeHash(treasury, t, treasury.nonce()));
			vm.expectRevert(_missing(address(treasury)));
			_guardCheck(treasury, t, next);
		}
	}

	/// A co-signature made for another treasury (or another chain: the hash includes the chain id) does not count.
	function test_P4_cosignatureForAnotherSafeOrChainRejected() public {
		ISafe other = ISafe(_createTreasury(_owners3(member, address(passkey), cosigner), 2, _admins(), 2, 1, safeL2));
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), recipient, 0, '', Operation.Call));
		assertTrue(_signAndExec(other, _signers(_s(member), _s(cosigner)), recipient, 0, '', Operation.Call));
		Tx memory t = Tx(recipient, 1, '', Operation.Call, 0, 0, 0, address(0), address(0));
		bytes memory forOther = _sigsFor(_safeHash(other, t, other.nonce() - 1));
		vm.expectRevert(_missing(address(treasury)));
		_guardCheck(treasury, t, forOther);

		uint256 id = block.chainid;
		vm.chainId(id + 1);
		bytes memory otherChain = _sigsFor(_safeHash(treasury, t, treasury.nonce() - 1));
		vm.chainId(id);
		vm.expectRevert(_missing(address(treasury)));
		_guardCheck(treasury, t, otherChain);
		_guardCheck(treasury, t, _sigsFor(_safeHash(treasury, t, treasury.nonce() - 1)));
	}

	/// The hash is asked for with the head and `data` only: the signatures (often the bulk of the call) are not
	/// sent to the Safe again.
	function test_P4_hashCallCarriesHeadAndDataOnly() public {
		FakeSafe fake = new FakeSafe();
		fake.register(guard, cosigner);
		fake.setHashReturn(abi.encode(bytes32(uint256(1))));
		// selector + eleven head words + data's length word (data is empty).
		fake.setMaxHashCall(4 + 0x160 + 0x20);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.MissingCosignerSignature.selector, address(fake), cosigner));
		fake.check(guard, new bytes(130 + 97));
		// One byte less is too short for that call: the cap is exact.
		fake.setMaxHashCall(4 + 0x160 + 0x20 - 1);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130 + 97));
	}

	/* ==================================================================================== P5 */

	/// A Safe that installs the guard without registering a co-signer can't use the normal path at all.
	function test_P5_guardWithoutCosignerFreezesSafe() public {
		address[] memory owners = new address[](2);
		owners[0] = member;
		owners[1] = cosigner;
		bytes memory init = abi.encodeCall(
			ISafeSetup.setup,
			(owners, 2, address(0), bytes(''), fallbackHandler, address(0), 0, payable(address(0)))
		);
		ISafe plain = ISafe(factory.createProxyWithNonce(safeL2, init, 99));
		vm.deal(address(plain), 1 ether);
		assertTrue(_signAndExec(plain, _signers(_s(member), _s(cosigner)), address(plain), 0, abi.encodeCall(ISafeSetup.setGuard, (address(guard))), Operation.Call));
		bytes memory sigs = _sign(plain, _signers(_s(member), _s(cosigner)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignerNotSet.selector, address(plain)));
		_exec(plain, recipient, 1 ether, '', Operation.Call, sigs);
	}

	/// A caller that registered a co-signer but is not a Safe gets no pass.
	function test_P5_nonSafeCallerRejected() public {
		FakeSafe fake = new FakeSafe();
		fake.register(guard, cosigner);
		// The threshold is checked before the hash is asked for: a threshold-1 caller with no hash gets ThresholdTooLow.
		fake.setThreshold(1);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.ThresholdTooLow.selector, 1));
		fake.check(guard, new bytes(130 + 97));
		fake.setThreshold(2);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130));

		fake.setHashReturn(new bytes(64));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130));

		// A call that reverts with exactly one word of revert data: the word is not taken as a hash.
		fake.setRevertWithWord();
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130 + 97));

		// A successful call that returns fewer than 32 bytes is not a hash either.
		fake.setHashReturn(new bytes(0));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130 + 97));
		fake.setHashReturn(new bytes(31));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		fake.check(guard, new bytes(130 + 97));

		fake.setHashReturn(abi.encode(bytes32(uint256(1))));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.MissingCosignerSignature.selector, address(fake), cosigner));
		fake.check(guard, new bytes(130 + 97));

		// Too-short signatures never pass.
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(fake)));
		fake.check(guard, new bytes(64));

		// `data` moved into the head (word 6, gasPrice, as its length): ending one byte short of the ten head words
		// getTransactionHash takes, the guard refuses rather than send the Safe a shortened head; ending exactly
		// there, the Safe is asked (testFuzz_P5_dataEndingInHeadRefused covers every end).
		(bool ok, bytes memory ret) = fake.checkWithDataAt(guard, new bytes(130 + 97), 6, 0x143 - 0xe4);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		(ok, ret) = fake.checkWithDataAt(guard, new bytes(130 + 97), 6, 0x144 - 0xe4);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasuryGuard.MissingCosignerSignature.selector, address(fake), cosigner));

		// nonce 0: there is no transaction in flight. Long enough to pass the length check, so the revert is the
		// nonce underflow itself.
		fake.setNonce(0);
		vm.expectRevert(stdError.arithmeticError);
		fake.check(guard, new bytes(130 + 97));
	}

	/// Whichever plain head word serves as `data`'s length (all but `data`'s own offset, `operation` (whose decoder
	/// takes only 0 or 1), `signatures`' offset and `msgSender`), and whatever it holds, the guard refuses exactly when
	/// `data` ends before getTransactionHash's ten head words (byte 0x144); otherwise the Safe's answer decides.
	function testFuzz_P5_dataEndingInHeadRefused(uint8 pick, uint256 len) public {
		FakeSafe fake = new FakeSafe();
		fake.register(guard, cosigner);
		fake.setHashReturn(abi.encode(bytes32(uint256(1))));
		// to, value, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver (the lengths fit an address)
		uint256[7] memory words = [uint256(0), 1, 4, 5, 6, 7, 8];
		uint256 word = words[pick % 7];
		bytes memory sigs = new bytes(130 + 97);
		// The call is 4 + 0x160 (head) + 0x20 (data's own length word) + 0x20 + 0x100 (signatures) bytes long.
		uint256 start = 4 + word * 0x20 + 0x20;
		len = bound(len, 0, 4 + 0x160 + 0x20 + 0x20 + 0x100 - start);
		(bool ok, bytes memory ret) = fake.checkWithDataAt(guard, sigs, word, len);
		assertFalse(ok);
		if (start + len < 0x144) {
			assertEq(ret, abi.encodeWithSelector(TreasuryGuard.TransactionHashUnavailable.selector, address(fake)));
		} else {
			assertEq(ret, abi.encodeWithSelector(TreasuryGuard.MissingCosignerSignature.selector, address(fake), cosigner));
		}
	}

	/* ==================================================================================== P6 */

	function test_P6_setCosignerRules() public {
		// An EOA (no isOwner) can't register.
		vm.prank(member);
		vm.expectRevert();
		guard.setCosigner(cosigner);

		vm.prank(address(treasury));
		vm.expectRevert(TreasuryGuard.ZeroCosigner.selector);
		guard.setCosigner(address(0));

		vm.prank(address(treasury));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignerNotOwner.selector, address(treasury), newCosigner));
		guard.setCosigner(newCosigner);

		// The treasury can re-register one of its own owners; another treasury's entry is untouched.
		ISafe other = ISafe(_createTreasury(_owners3(member, address(passkey), cosigner), 2, _admins(), 2, 2, safeL2));
		vm.expectEmit(true, true, false, false, address(guard));
		emit CosignerSet(address(treasury), member);
		vm.prank(address(treasury));
		guard.setCosigner(member);
		assertEq(guard.cosignerOf(address(treasury)), member);
		assertEq(guard.cosignerOf(address(other)), cosigner);
		assertEq(guard.cosignerOf(address(0xdead)), address(0));
	}

	/* ==================================================================================== P7 */

	/// The admins move funds through the timelock, without the co-signer, while the normal path would refuse.
	function test_P7_recoveryMovesFundsWithoutCosigner() public {
		bytes memory data = _transferData(recipient, 250_000e6);
		_queueRecovery(_signers(_s(admin1), _s(admin3)), address(token), 0, data, Operation.Call);
		vm.warp(block.timestamp + COOLDOWN);
		vm.prank(address(0x1234));
		delay.executeNextTx(address(token), 0, data, Operation.Call);
		assertEq(token.balanceOf(recipient), 250_000e6);
	}

	/// Recovery can remove the guard and replace the co-signer: Paycrest can't hold the treasury hostage.
	function test_P7_recoveryRemovesGuardAndReplacesCosigner() public {
		address[] memory tos = new address[](2);
		bytes[] memory datas = new bytes[](2);
		tos[0] = address(treasury);
		datas[0] = abi.encodeCall(ISafe.swapOwner, (address(passkey), cosigner, newCosigner));
		tos[1] = address(treasury);
		datas[1] = abi.encodeCall(ISafeSetup.setGuard, (address(0)));
		bytes memory ms = _multi(tos, datas);
		_queueRecovery(_signers(_s(admin2), _s(admin3)), multiSendCallOnly, 0, ms, Operation.DelegateCall);
		vm.warp(block.timestamp + COOLDOWN);
		delay.executeNextTx(multiSendCallOnly, 0, ms, Operation.DelegateCall);
		assertEq(uint256(vm.load(address(treasury), GUARD_SLOT)), 0);
		assertFalse(treasury.isOwner(cosigner));
		// Without the guard, two members (no Paycrest) can now act.
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(address(passkey))), recipient, 1 ether, '', Operation.Call));
	}

	/* ==================================================================================== P8 */

	function test_P8_supportsInterface() public view {
		bytes4 guardId = bytes4(keccak256('checkTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,address)')) ^
			bytes4(keccak256('checkAfterExecution(bytes32,bool)'));
		assertEq(bytes32(guardId), bytes32(bytes4(0xe6d7a83a)), 'Safe v1.4.1 Guard interface id');
		assertEq(bytes32(type(ISafeGuard).interfaceId), bytes32(guardId));
		assertTrue(guard.supportsInterface(guardId));
		assertTrue(guard.supportsInterface(type(IERC165).interfaceId));
		assertFalse(guard.supportsInterface(0xffffffff));
		assertFalse(guard.supportsInterface(0x1626ba7e)); // ERC-1271: the guard validates no signatures for anyone
		// Safe accepted it at setup (setGuard checks supportsInterface).
		assertEq(address(uint160(uint256(vm.load(address(treasury), GUARD_SLOT)))), address(guard));
	}

	function testFuzz_P8_otherInterfacesUnsupported(bytes4 id) public view {
		vm.assume(id != 0xe6d7a83a && id != type(IERC165).interfaceId);
		assertFalse(guard.supportsInterface(id));
	}

	/* ==================================================================================== P9 */

	function test_P9_hooksWriteNoStorage() public {
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), recipient, 1 ether, '', Operation.Call);
		vm.record();
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);
		(, bytes32[] memory writes) = vm.accesses(address(guard));
		assertEq(writes.length, 0);
	}

	/// For a treasury without a fallback handler (P17), the after-execution hook passes whatever the outcome.
	function testFuzz_P9_checkAfterExecutionPassesWithoutHandler(bytes32 h, bool ok) public {
		vm.prank(address(treasury));
		guard.checkAfterExecution(h, ok);
	}

	/* ==================================================================================== P10 */

	function test_P10_passkeyIsAMemberNotTheCosigner() public {
		assertTrue(_signAndExec(treasury, _signers(_s(address(passkey)), _s(cosigner)), recipient, 1 ether, '', Operation.Call));
		bytes memory sigs = _sign(treasury, _signers(_s(address(passkey)), _s(member)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(_missing(address(treasury)));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);
	}

	/// A contract co-signer (`v == 0`) is identified by `r`, like any contract owner, so it passes the counted-
	/// signature check; but it can't make the ECDSA deadline attestation (P16), so the normal path stays closed.
	/// The co-signer must be an EOA.
	function test_P10_contractCosignerCountedButCannotAttest() public {
		MockPasskey contractCosigner = new MockPasskey();
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _initWith(address(contractCosigner)), 3));
		vm.deal(address(t), 1 ether);
		bytes32 h = _hash(t, recipient, 1 ether, '', Operation.Call);
		bytes memory sigs = _sign(t, _signers(_s(member), _s(address(contractCosigner))), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(t)));
		_exec(t, recipient, 1 ether, '', Operation.Call, sigs);
		sigs = bytes.concat(sigs, _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(t), address(contractCosigner)));
		_exec(t, recipient, 1 ether, '', Operation.Call, sigs);
	}

	function _initWith(address cs) internal view returns (bytes memory) {
		TreasurySetup.Config memory c = _config(_admins(), 2);
		c.cosigner = cs;
		return _treasuryInitializer(_owners3(member, address(passkey), cs), 2, c);
	}

	/* ==================================================================================== P11 */

	function test_P11_setupWiresGuardTimelockAndRecovery() public view {
		assertEq(address(uint160(uint256(vm.load(address(treasury), GUARD_SLOT)))), address(guard));
		assertEq(guard.cosignerOf(address(treasury)), cosigner);
		assertEq(treasury.getThreshold(), 2);

		assertTrue(treasury.isModuleEnabled(address(delay)));
		assertEq(delay.owner(), address(treasury));
		assertEq(delay.avatar(), address(treasury));
		assertEq(delay.target(), address(treasury));
		assertEq(delay.txCooldown(), COOLDOWN);
		assertEq(delay.txExpiration(), EXPIRATION);
		assertTrue(delay.isModuleEnabled(address(recovery)));

		address[] memory owners = recovery.getOwners();
		assertEq(owners.length, 3);
		assertEq(owners[0], admin1);
		assertEq(owners[1], admin2);
		assertEq(owners[2], admin3);
		assertEq(recovery.getThreshold(), 2);
		assertTrue(recovery.isModuleEnabled(address(treasury)));
		assertEq(uint256(vm.load(address(recovery), GUARD_SLOT)), 0, 'recovery has no guard');
		assertEq(
			address(uint160(uint256(vm.load(address(recovery), HANDLER_SLOT)))),
			fallbackHandler,
			'recovery Safe has the configured handler'
		);
	}

	function test_P11_thresholdBelowTwoRejected() public {
		vm.expectRevert();
		factory.createProxyWithNonce(safeL2, _treasuryInitializer(_owners3(member, address(passkey), cosigner), 1, _config(_admins(), 2)), 4);

		// The helper's own check, reached through a delegatecall from a threshold-1 context.
		vm.mockCall(address(this), abi.encodeWithSelector(ISafeView.getThreshold.selector), abi.encode(uint256(1)));
		(bool ok, bytes memory ret) = address(setupHelper).delegatecall(abi.encodeCall(TreasurySetup.setupTreasury, (_config(_admins(), 2))));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.TreasuryThresholdTooLow.selector, 1));
	}

	function test_P11_onlyDelegateCall() public {
		vm.expectRevert(TreasurySetup.OnlyDelegateCall.selector);
		setupHelper.setupTreasury(_config(_admins(), 2));
		vm.expectRevert(TreasurySetup.OnlyDelegateCall.selector);
		setupHelper.setupRecovery(address(treasury));
	}

	/// A single-admin business: 1-of-1 recovery with a 7-day wait.
	function test_P11_singleAdminRecovery() public {
		address[] memory one = new address[](1);
		one[0] = admin1;
		TreasurySetup.Config memory c = _config(one, 1);
		c.recoveryCooldown = 7 days;
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, c), 5));
		(IDelay d, ISafe r) = _recoveryOf(address(t));
		assertEq(d.txCooldown(), 7 days);
		assertEq(r.getThreshold(), 1);
	}

	/// The recovery Safe's address is public and the factory doesn't salt with the caller, so anyone can deploy it
	/// before the treasury exists. The treasury's setup then reuses it instead of reverting.
	function test_P11_recoverySafeDeployedFirstIsReused() public {
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, _config(_admins(), 2));
		address predicted = _predictSafe(safeL2, init, 55);
		bytes memory recoveryInit = setupHelper.recoveryInitializer(predicted, _admins(), 2, fallbackHandler);
		vm.prank(address(0xBAD));
		address early = factory.createProxyWithNonce(safeL2, recoveryInit, uint256(uint160(predicted)));
		assertEq(early, setupHelper.predictRecovery(address(factory), safeL2, recoveryInit, uint256(uint160(predicted))));

		address t = factory.createProxyWithNonce(safeL2, init, 55);
		assertEq(t, predicted);
		(IDelay d, ISafe r) = _recoveryOf(t);
		assertEq(address(r), early);
		assertTrue(r.isModuleEnabled(t));
		assertTrue(ISafe(address(d)).isModuleEnabled(early));
		assertEq(guard.cosignerOf(t), cosigner);

		// Recovery works through the reused Safe.
		token.mint(t, 1e6);
		bytes memory data = _transferData(recipient, 1e6);
		bytes memory q = abi.encodeCall(IDelay.execTransactionFromModule, (address(token), 0, data, Operation.Call));
		assertTrue(_signAndExec(r, _signers(_s(admin1), _s(admin2)), address(d), 0, q, Operation.Call));
		vm.warp(block.timestamp + COOLDOWN);
		d.executeNextTx(address(token), 0, data, Operation.Call);
		assertEq(token.balanceOf(recipient), 1e6);
	}

	/// A recovery Safe deployed first whose admins then removed the treasury as its module can't be wired in: the
	/// treasury's setup is refused rather than left without a working recovery path.
	function test_P11_unwiredRecoverySafeRefused() public {
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, _config(_admins(), 2));
		address predicted = _predictSafe(safeL2, init, 56);
		ISafe early = ISafe(
			factory.createProxyWithNonce(
				safeL2,
				setupHelper.recoveryInitializer(predicted, _admins(), 2, fallbackHandler),
				uint256(uint160(predicted))
			)
		);
		assertTrue(_signAndExec(early, _signers(_s(admin1), _s(admin2)), address(early), 0, abi.encodeCall(ISafe.disableModule, (SENTINEL, predicted)), Operation.Call));
		assertFalse(early.isModuleEnabled(predicted));

		// SafeProxyFactory drops the setup's revert data; the treasury is not created.
		vm.expectRevert();
		factory.createProxyWithNonce(safeL2, init, 56);
		assertEq(predicted.code.length, 0);
	}

	/// The refusal above is `RecoveryNotWired(recovery)`, shown through the delegatecall path (the factory drops it).
	function test_P11_unwiredRecoveryNamedError() public {
		bytes memory rInit = setupHelper.recoveryInitializer(address(this), _admins(), 2, fallbackHandler);
		ISafe early = ISafe(factory.createProxyWithNonce(safeL2, rInit, uint256(uint160(address(this)))));
		assertTrue(_signAndExec(early, _signers(_s(admin1), _s(admin2)), address(early), 0, abi.encodeCall(ISafe.disableModule, (SENTINEL, address(this))), Operation.Call));
		(bool ok, bytes memory ret) = _setupFromHere(_config(_admins(), 2));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryNotWired.selector, address(early)));
	}

	/* ==================================================================================== P12 */

	function test_P12_recoveryWaitsForCooldown() public {
		bytes memory data = _transferData(recipient, 1e6);
		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(token), 0, data, Operation.Call);
		vm.warp(block.timestamp + COOLDOWN - 1);
		vm.expectRevert(bytes('Transaction is still in cooldown'));
		delay.executeNextTx(address(token), 0, data, Operation.Call);
		vm.warp(block.timestamp + 1);
		delay.executeNextTx(address(token), 0, data, Operation.Call);
		assertEq(token.balanceOf(recipient), 1e6);
	}

	function test_P12_recoveryNeedsAdminMajority() public {
		bytes memory q = abi.encodeCall(IDelay.execTransactionFromModule, (address(token), 0, _transferData(recipient, 1e6), Operation.Call));
		bytes memory sigs = _sign(recovery, _signers(_s(admin1)), address(delay), 0, q, Operation.Call);
		vm.expectRevert(bytes('GS020'));
		_exec(recovery, address(delay), 0, q, Operation.Call, sigs);
		// Members and the co-signer are not admins.
		vm.expectRevert(bytes('Module not authorized'));
		vm.prank(cosigner);
		delay.execTransactionFromModule(address(token), 0, _transferData(recipient, 1e6), Operation.Call);
	}

	function test_P12_recoveryExpires() public {
		bytes memory data = _transferData(recipient, 1e6);
		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(token), 0, data, Operation.Call);
		vm.warp(block.timestamp + COOLDOWN + EXPIRATION + 1);
		vm.expectRevert(bytes('Transaction expired'));
		delay.executeNextTx(address(token), 0, data, Operation.Call);
	}

	/// While a recovery waits, a member and the co-signer cancel it.
	function test_P12_treasuryCancelsRecovery() public {
		bytes memory data = _transferData(recipient, 1e6);
		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(token), 0, data, Operation.Call);
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), address(delay), 0, abi.encodeCall(IDelay.setTxNonce, (delay.queueNonce())), Operation.Call));
		vm.warp(block.timestamp + COOLDOWN);
		vm.expectRevert(bytes('Transaction queue is empty'));
		delay.executeNextTx(address(token), 0, data, Operation.Call);
		// Members alone can't cancel.
		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(token), 0, data, Operation.Call);
		bytes memory cancel = abi.encodeCall(IDelay.setTxNonce, (delay.queueNonce()));
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(address(passkey))), address(delay), 0, cancel, Operation.Call);
		vm.expectRevert(_missing(address(treasury)));
		_exec(treasury, address(delay), 0, cancel, Operation.Call, sigs);
	}

	/// The treasury (normal path) keeps the recovery Safe's admins in step with the team, as its module.
	function test_P12_treasuryManagesRecoveryOwners() public {
		bytes memory swap = abi.encodeCall(ISafe.swapOwner, (admin2, admin3, member));
		bytes memory viaModule = abi.encodeCall(ISafe.execTransactionFromModule, (address(recovery), 0, swap, Operation.Call));
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), address(recovery), 0, viaModule, Operation.Call));
		assertTrue(recovery.isOwner(member));
		assertFalse(recovery.isOwner(admin3));
	}

	/* ==================================================================================== P13 */

	function test_P13_addressesPredictable() public {
		// The timelock's salt is part of every treasury's predicted timelock address: pinned, not read back.
		assertEq(setupHelper.DELAY_SALT(), keccak256('paycrest.treasury.delay'));
		TreasurySetup.Config memory c = _config(_admins(), 2);
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, c);
		address predicted = _predictSafe(safeL2, init, 42);
		address predictedDelay = Clones.predictDeterministicAddress(delayMastercopy, setupHelper.DELAY_SALT(), predicted);
		address predictedRecovery = _predictSafe(
			safeL2,
			setupHelper.recoveryInitializer(predicted, _admins(), 2, fallbackHandler),
			uint256(uint160(predicted))
		);
		address t = factory.createProxyWithNonce(safeL2, init, 42);
		(IDelay d, ISafe r) = _recoveryOf(t);
		assertEq(t, predicted);
		assertEq(address(d), predictedDelay);
		assertEq(address(r), predictedRecovery);
	}

	/// Same initializer and salt: same treasury, timelock and recovery Safe on every chain.
	function test_P13_sameAddressesOnEveryChain() public {
		uint256[6] memory chains = [uint256(1), 137, 8453, 56, 42161, 42220];
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, _config(_admins(), 2));
		address first;
		address firstDelay;
		address firstRecovery;
		for (uint256 i = 0; i < chains.length; ++i) {
			uint256 snap = vm.snapshotState();
			vm.chainId(chains[i]);
			address t = factory.createProxyWithNonce(safeL2, init, 77);
			(IDelay d, ISafe r) = _recoveryOf(t);
			if (i == 0) (first, firstDelay, firstRecovery) = (t, address(d), address(r));
			assertEq(t, first);
			assertEq(address(d), firstDelay);
			assertEq(address(r), firstRecovery);
			vm.revertToState(snap);
		}
	}

	/// The singleton is part of the address: "Safe on Ethereum, SafeL2 elsewhere" would split the treasury
	/// across two addresses, so every network uses SafeL2.
	function test_P13_singletonChangesAddress() public view {
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, _config(_admins(), 2));
		assertTrue(_predictSafe(safeL2, init, 42) != _predictSafe(safeL1, init, 42));
	}

	/* ==================================================================================== P14 */

	/// Rotate the co-signer key in one co-signed transaction, without recovery.
	function test_P14_cosignerRotation() public {
		address[] memory tos = new address[](2);
		bytes[] memory datas = new bytes[](2);
		tos[0] = address(treasury);
		datas[0] = abi.encodeCall(ISafe.swapOwner, (address(passkey), cosigner, newCosigner));
		tos[1] = address(guard);
		datas[1] = abi.encodeCall(TreasuryGuard.setCosigner, (newCosigner));
		bytes memory ms = _multi(tos, datas);
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), multiSendCallOnly, 0, ms, Operation.DelegateCall));
		assertEq(guard.cosignerOf(address(treasury)), newCosigner);

		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), recipient, 1 ether, '', Operation.Call);
		vm.expectRevert(bytes('GS026'));
		_exec(treasury, recipient, 1 ether, '', Operation.Call, sigs);
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(newCosigner)), recipient, 1 ether, '', Operation.Call));
	}

	/// Re-registering before the owner swap fails, so the guard never points at a non-owner by mistake.
	function test_P14_rotationOrderEnforced() public {
		address[] memory tos = new address[](2);
		bytes[] memory datas = new bytes[](2);
		tos[0] = address(guard);
		datas[0] = abi.encodeCall(TreasuryGuard.setCosigner, (newCosigner));
		tos[1] = address(treasury);
		datas[1] = abi.encodeCall(ISafe.swapOwner, (address(passkey), cosigner, newCosigner));
		bytes memory ms = _multi(tos, datas);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), multiSendCallOnly, 0, ms, Operation.DelegateCall);
		// MultiSend's inner setCosigner reverts (CosignerNotOwner), so the Safe reports the failed call.
		vm.expectRevert(bytes('GS013'));
		_exec(treasury, multiSendCallOnly, 0, ms, Operation.DelegateCall, sigs);
		assertEq(guard.cosignerOf(address(treasury)), cosigner);
	}

	/* ==================================================================================== P15 */

	/// A co-signature runs up to and including its deadline, and never after it.
	function testFuzz_P15_validUntilDeadline(uint32 ttl, uint32 dt) public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		uint256 deadline = block.timestamp + ttl;
		bytes memory sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, deadline);
		vm.warp(block.timestamp + dt);
		if (block.timestamp > deadline) {
			vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignatureExpired.selector, deadline, block.timestamp));
			_exec(treasury, address(token), 0, data, Operation.Call, sigs);
			assertEq(token.balanceOf(recipient), 0);
		} else {
			assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));
			assertEq(token.balanceOf(recipient), 1e6);
		}
	}

	/// Fixed boundary cases: a co-signature runs at exactly its deadline, and the full 256-bit deadline is compared.
	function test_P15_deadlineBoundaries() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		uint256 deadline = block.timestamp + 100;
		bytes memory sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, deadline);
		vm.warp(deadline);
		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));

		// A deadline above 2^64 is not truncated: its low 64 bits are already in the past.
		h = _hash(treasury, address(token), 0, data, Operation.Call);
		deadline = (uint256(1) << 64) + 5;
		sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, deadline);
		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));

		// Nor above 2^128 or with the top bit set: signed and compared as the full word.
		h = _hash(treasury, address(token), 0, data, Operation.Call);
		deadline = (uint256(1) << 128) + 5;
		sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, deadline);
		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));
		h = _hash(treasury, address(token), 0, data, Operation.Call);
		deadline = (uint256(1) << 255) + 5;
		sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, deadline);
		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));
		assertEq(token.balanceOf(recipient), 4e6);
	}

	/// The co-signer service's supersede case: a co-signature expires at nonce N, the service co-signs a
	/// replacement at the same nonce, and only the replacement can run; the expired one never does.
	function test_P15_expiredCosignatureCannotRunAfterReplacement() public {
		bytes memory first = _transferData(recipient, 100e6);
		bytes memory second = _transferData(address(0xCAFE), 100e6);
		uint256 firstDeadline = block.timestamp + COSIGN_TTL;
		bytes memory firstSigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, first, Operation.Call);
		vm.warp(firstDeadline + 1);
		bytes memory secondSigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, second, Operation.Call);

		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignatureExpired.selector, firstDeadline, block.timestamp));
		_exec(treasury, address(token), 0, first, Operation.Call, firstSigs);
		assertTrue(_exec(treasury, address(token), 0, second, Operation.Call, secondSigs));
		assertEq(token.balanceOf(recipient), 0);
		assertEq(token.balanceOf(address(0xCAFE)), 100e6);
	}

	/// Cancelling a queued recovery (normal path) needs a live co-signature too.
	function test_P15_expiredCancelRefused() public {
		_queueRecovery(_signers(_s(admin1), _s(admin2)), address(token), 0, _transferData(recipient, 1e6), Operation.Call);
		bytes memory cancel = abi.encodeCall(IDelay.setTxNonce, (delay.queueNonce()));
		uint256 deadline = block.timestamp + COSIGN_TTL;
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(delay), 0, cancel, Operation.Call);
		vm.warp(deadline + 1);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.CosignatureExpired.selector, deadline, block.timestamp));
		_exec(treasury, address(delay), 0, cancel, Operation.Call, sigs);
	}

	/* ==================================================================================== P16 */

	/// Without an attestation after the counted signatures, a fully signed transaction is refused.
	function test_P16_attestationRequired() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes memory sigs = _stripAttestation(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(treasury)));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		// One byte short of an attestation after the two counted parts.
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.DeadlineAttestationMissing.selector, address(treasury)));
		_exec(treasury, address(token), 0, data, Operation.Call, bytes.concat(sigs, new bytes(96)));
	}

	/// Only the registered co-signer's attestation counts: not a member's, and not a rotated-out co-signer's.
	function test_P16_attestationMustBeCosigners() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);
		bytes memory bad = _reattest(sigs, memberPk, h, block.timestamp + COSIGN_TTL);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, bad);
		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));

		// Rotate to the new co-signer; the old key's attestation no longer counts.
		address[] memory tos = new address[](2);
		bytes[] memory datas = new bytes[](2);
		tos[0] = address(treasury);
		datas[0] = abi.encodeCall(ISafe.swapOwner, (address(passkey), cosigner, newCosigner));
		tos[1] = address(guard);
		datas[1] = abi.encodeCall(TreasuryGuard.setCosigner, (newCosigner));
		assertTrue(_signAndExec(treasury, _signers(_s(member), _s(cosigner)), multiSendCallOnly, 0, _multi(tos, datas), Operation.DelegateCall));
		h = _hash(treasury, address(token), 0, data, Operation.Call);
		sigs = _reattest(_sign(treasury, _signers(_s(member), _s(newCosigner)), address(token), 0, data, Operation.Call), cosignerPk, h, block.timestamp + COSIGN_TTL);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), newCosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
	}

	/// An attestation that is not the co-signer's is refused as such even when its deadline has also passed.
	function test_P16_forgedAttestationRefusedBeforeExpiry() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		bytes memory sigs = _reattest(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call), memberPk, h, block.timestamp - 1);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
	}

	/// Every bit of the deadline word is signed: flipping any one of the 256 makes the attestation invalid.
	function test_P16_everyDeadlineBitSigned() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes memory signed = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);
		for (uint256 bit = 0; bit < 256; ++bit) {
			bytes memory sigs = bytes.concat(signed);
			uint256 mask = uint256(1) << bit;
			// solhint-disable-next-line no-inline-assembly
			assembly {
				let p := add(add(sigs, 0x20), sub(mload(sigs), 97))
				mstore(p, xor(mload(p), mask))
			}
			vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
			_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		}
	}

	/// The co-signer's Safe signature over the transaction hash is not a deadline attestation: placed after a
	/// deadline word, it does not recover to the co-signer for the deadline digest.
	function test_P16_safeSignatureIsNotAnAttestation() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		bytes memory signed = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);
		(uint8 v, bytes32 r, bytes32 sv) = vm.sign(cosignerPk, h);
		bytes memory sigs = bytes.concat(_stripAttestation(signed), bytes32(block.timestamp + 60), r, sv, bytes1(v));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
	}

	/// An attestation is bound to its transaction and deadline: one for another transaction, or with the
	/// deadline word changed (to extend it), does not verify.
	function test_P16_attestationBoundToTransactionAndDeadline() public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);

		bytes32 other = _hash(treasury, address(token), 0, _transferData(recipient, 2e6), Operation.Call);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, _reattest(sigs, cosignerPk, other, block.timestamp + COSIGN_TTL));

		bytes memory extended = _stripAttestation(sigs);
		bytes memory tail = _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			mstore(add(tail, 0x20), add(mload(add(tail, 0x20)), 86400))
		}
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, bytes.concat(extended, tail));

		// The whole deadline word is signed: a deadline pushed past 2^64 is not the attested one.
		tail = _attestation(cosignerPk, h, block.timestamp + COSIGN_TTL);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			mstore(add(tail, 0x20), add(mload(add(tail, 0x20)), shl(64, 1)))
		}
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, bytes.concat(extended, tail));

		assertTrue(_exec(treasury, address(token), 0, data, Operation.Call, sigs));
	}

	/// Fuzzed tails: any 97 bytes that are not the co-signer's attestation for this transaction are refused.
	function testFuzz_P16_randomTailRefused(uint256 deadline, bytes32 r, bytes32 s, uint8 v) public {
		bytes memory data = _transferData(recipient, 1e6);
		bytes memory sigs = _stripAttestation(_sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call));
		bytes32 h = _hash(treasury, address(token), 0, data, Operation.Call);
		vm.assume(ecrecover(_deadlineDigest(h, deadline), v, r, s) != cosigner);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.InvalidDeadlineAttestation.selector, address(treasury), cosigner));
		_exec(treasury, address(token), 0, data, Operation.Call, bytes.concat(sigs, bytes32(deadline), r, s, bytes1(v)));
	}

	/// The digest is the documented one (the co-signer service computes it independently).
	function test_P16_digestEncoding() public view {
		assertEq(guard.DEADLINE_TYPEHASH(), keccak256('TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)'));
		bytes32 h = keccak256('tx');
		assertEq(guard.deadlineDigest(h, 1_800_000_900), keccak256(abi.encode(guard.DEADLINE_TYPEHASH(), h, uint256(1_800_000_900))));
		assertEq(guard.ATTESTATION_LENGTH(), 97);
	}

	/* ==================================================================================== P17 */

	function _initWithHandler(address handler) internal view returns (bytes memory) {
		return
			abi.encodeCall(
				ISafeSetup.setup,
				(
					_owners3(member, address(passkey), cosigner),
					2,
					address(setupHelper),
					abi.encodeCall(TreasurySetup.setupTreasury, (_config(_admins(), 2))),
					handler,
					address(0),
					0,
					payable(address(0))
				)
			);
	}

	/// The treasury has no fallback handler, so it answers no ERC-1271 check: owner signatures that a Safe with
	/// Safe's handler accepts (two members, no co-signer) are worthless for permits and off-chain orders.
	function test_P17_treasuryAnswersNoErc1271() public {
		assertEq(uint256(vm.load(address(treasury), HANDLER_SLOT)), 0);
		// The same owners in a plain Safe with the handler: its ERC-1271 accepts two member signatures.
		ISafe plain = ISafe(
			factory.createProxyWithNonce(
				safeL2,
				abi.encodeCall(
					ISafeSetup.setup,
					(_owners3(member, admin1, cosigner), 2, address(0), '', fallbackHandler, address(0), 0, payable(address(0)))
				),
				77
			)
		);
		bytes32 digest = keccak256('permit: spend everything');
		assertTrue(SignatureChecker.isValidSignatureNow(address(plain), digest, _erc1271Sigs(plain, digest, member, admin1)));

		(bool ok, bytes memory ret) = address(treasury).staticcall(abi.encodeWithSelector(0x1626ba7e, digest, _erc1271Sigs(treasury, digest, member, cosigner)));
		assertTrue(ok);
		assertEq(ret.length, 0, 'no handler: empty answer');
		assertFalse(SignatureChecker.isValidSignatureNow(address(treasury), digest, _erc1271Sigs(treasury, digest, member, cosigner)));
	}

	/// Two ECDSA owner signatures over Safe's ERC-1271 message hash for `digest`, sorted by owner.
	function _erc1271Sigs(ISafe safe, bytes32 digest, address a, address b) internal view returns (bytes memory) {
		bytes32 m = keccak256(
			abi.encodePacked(
				bytes1(0x19),
				bytes1(0x01),
				_domainSeparator(safe),
				keccak256(abi.encode(keccak256('SafeMessage(bytes message)'), keccak256(abi.encode(digest))))
			)
		);
		if (a > b) (a, b) = (b, a);
		(uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(keyOf[a], m);
		(uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(keyOf[b], m);
		return bytes.concat(r1, s1, bytes1(v1), r2, s2, bytes1(v2));
	}

	function _domainSeparator(ISafe safe) internal view returns (bytes32) {
		(, bytes memory ret) = address(safe).staticcall(abi.encodeWithSignature('domainSeparator()'));
		return abi.decode(ret, (bytes32));
	}

	/// A treasury whose `Safe.setup` sets a fallback handler is never created.
	function test_P17_setupWithHandlerRefused() public {
		bytes memory init = _initWithHandler(fallbackHandler);
		address predicted = _predictSafe(safeL2, init, 78);
		vm.expectRevert();
		factory.createProxyWithNonce(safeL2, init, 78);
		assertEq(predicted.code.length, 0);
		// The helper's own check, reached through a delegatecall from a context that has a handler.
		vm.mockCall(address(this), abi.encodeWithSelector(ISafeView.getThreshold.selector), abi.encode(uint256(2)));
		vm.store(address(this), HANDLER_SLOT, bytes32(uint256(uint160(fallbackHandler))));
		(bool ok, bytes memory ret) = address(setupHelper).delegatecall(abi.encodeCall(TreasurySetup.setupTreasury, (_config(_admins(), 2))));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.FallbackHandlerSet.selector, fallbackHandler));
		vm.store(address(this), HANDLER_SLOT, bytes32(0));
	}

	/// setupTreasury refuses every non-zero handler, including the guard, the co-signer and a precompile address.
	function testFuzz_P17_setupRefusesAnyHandler(address handler, uint8 pick) public {
		address[4] memory special = [address(guard), cosigner, address(1), fallbackHandler];
		if (pick % 5 < 4) handler = special[pick % 5];
		vm.assume(handler != address(0));
		vm.mockCall(address(this), abi.encodeWithSelector(ISafeView.getThreshold.selector), abi.encode(uint256(2)));
		vm.store(address(this), HANDLER_SLOT, bytes32(uint256(uint160(handler))));
		(bool ok, bytes memory ret) = address(setupHelper).delegatecall(abi.encodeCall(TreasurySetup.setupTreasury, (_config(_admins(), 2))));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.FallbackHandlerSet.selector, handler));
	}

	/// A co-signed transaction can't set a fallback handler: not Safe's, not the guard (whose `setCosigner` would
	/// then be callable by anyone through the treasury), not one set while removing the guard in the same batch.
	function test_P17_cosignedHandlerChangeRefused() public {
		address[3] memory handlers = [fallbackHandler, address(guard), address(0xF00D)];
		for (uint256 i = 0; i < handlers.length; ++i) {
			bytes memory data = abi.encodeWithSignature('setFallbackHandler(address)', handlers[i]);
			bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(treasury), 0, data, Operation.Call);
			vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.FallbackHandlerSet.selector, address(treasury), handlers[i]));
			_exec(treasury, address(treasury), 0, data, Operation.Call, sigs);
		}

		address[] memory tos = new address[](2);
		bytes[] memory datas = new bytes[](2);
		tos[0] = address(treasury);
		datas[0] = abi.encodeWithSignature('setFallbackHandler(address)', fallbackHandler);
		tos[1] = address(treasury);
		datas[1] = abi.encodeCall(ISafeSetup.setGuard, (address(0)));
		bytes memory ms = _multi(tos, datas);
		bytes memory msSigs = _sign(treasury, _signers(_s(member), _s(cosigner)), multiSendCallOnly, 0, ms, Operation.DelegateCall);
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.FallbackHandlerSet.selector, address(treasury), fallbackHandler));
		_exec(treasury, multiSendCallOnly, 0, ms, Operation.DelegateCall, msSigs);

		assertEq(uint256(vm.load(address(treasury), HANDLER_SLOT)), 0);
		assertEq(address(uint160(uint256(vm.load(address(treasury), GUARD_SLOT)))), address(guard));
	}

	/// The hook refuses any handler a Safe reports, for any transaction outcome.
	function testFuzz_P17_anyHandlerRefused(address handler, bytes32 h, bool ok) public {
		vm.assume(handler != address(0));
		vm.store(address(treasury), HANDLER_SLOT, bytes32(uint256(uint160(handler))));
		vm.prank(address(treasury));
		vm.expectRevert(abi.encodeWithSelector(TreasuryGuard.FallbackHandlerSet.selector, address(treasury), handler));
		guard.checkAfterExecution(h, ok);
	}

	/// A handler slot with bits set above the address (Safe's setter never writes one) reverts while decoding.
	function test_P17_dirtyHandlerSlotRevertsDecoding() public {
		bytes32[2] memory words = [bytes32(uint256(1) << 160), bytes32((uint256(1) << 160) | uint256(uint160(fallbackHandler)))];
		for (uint256 i = 0; i < words.length; ++i) {
			vm.store(address(treasury), HANDLER_SLOT, words[i]);
			vm.prank(address(treasury));
			vm.expectRevert(bytes(''));
			guard.checkAfterExecution(bytes32(0), true);
		}
	}

	/* ==================================================================================== P18 */

	/// Runs `setupTreasury(c)` by delegatecall from this contract, playing a threshold-2 Safe without a handler.
	function _setupFromHere(TreasurySetup.Config memory c) internal returns (bool ok, bytes memory ret) {
		vm.mockCall(address(this), abi.encodeWithSelector(ISafeView.getThreshold.selector), abi.encode(uint256(2)));
		(ok, ret) = address(setupHelper).delegatecall(abi.encodeCall(TreasurySetup.setupTreasury, (c)));
	}

	function test_P18_cooldownAtLeastADay() public {
		assertEq(setupHelper.MIN_RECOVERY_COOLDOWN(), 24 hours);
		TreasurySetup.Config memory c = _config(_admins(), 2);
		c.recoveryCooldown = 24 hours - 1;
		(bool ok, bytes memory ret) = _setupFromHere(c);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryCooldownTooShort.selector, 24 hours - 1));
		c.recoveryCooldown = 0;
		(ok, ret) = _setupFromHere(c);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryCooldownTooShort.selector, 0));

		// Exactly a day, with the shortest expiration Delay allows, is accepted.
		c.recoveryCooldown = 24 hours;
		c.recoveryExpiration = 60;
		ISafe t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, c), 79));
		(IDelay d, ) = _recoveryOf(address(t));
		assertEq(d.txCooldown(), 24 hours);
		assertEq(d.txExpiration(), 60);

		// The bound reads the whole cooldown: 2^255 seconds (whose lower bits are all zero) is accepted.
		c.recoveryCooldown = uint256(1) << 255;
		t = ISafe(factory.createProxyWithNonce(safeL2, _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, c), 81));
		(d, ) = _recoveryOf(address(t));
		assertEq(d.txCooldown(), uint256(1) << 255);
	}

	function test_P18_expirationRequired() public {
		TreasurySetup.Config memory c = _config(_admins(), 2);
		c.recoveryExpiration = 0;
		(bool ok, bytes memory ret) = _setupFromHere(c);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryExpirationRequired.selector));
		// Below Delay's own minute: Delay's own check refuses it, and setup passes its reason through.
		c.recoveryExpiration = 59;
		(ok, ret) = _setupFromHere(c);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSignature('Error(string)', 'Expiratition must be 0 or at least 60 seconds'));
	}

	function test_P18_recoveryThresholdIsAMajority() public {
		address[] memory two = new address[](2);
		two[0] = admin1;
		two[1] = admin2;
		(bool ok, bytes memory ret) = _setupFromHere(_config(_admins(), 1));
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryThresholdNotMajority.selector, 1, 3));
		(ok, ret) = _setupFromHere(_config(two, 1));
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryThresholdNotMajority.selector, 1, 2));
		(ok, ret) = _setupFromHere(_config(new address[](0), 0));
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.RecoveryThresholdNotMajority.selector, 0, 0));
		// 2 of 2 and 2 of 3 are majorities (the default treasury is 2 of 3).
		ISafe t = ISafe(_createTreasury(_owners3(member, address(passkey), cosigner), 2, two, 2, 80, safeL2));
		(, ISafe r) = _recoveryOf(address(t));
		assertEq(r.getThreshold(), 2);
	}

	/// Delay at an address without code: refused before a clone is made (a clone of nothing accepts every call
	/// and anyone could initialise it later).
	function test_P18_codelessDelayMastercopyRefused() public {
		TreasurySetup.Config memory c = _config(_admins(), 2);
		c.delayMastercopy = address(0xDE1A7);
		(bool ok, bytes memory ret) = _setupFromHere(c);
		assertFalse(ok);
		assertEq(ret, abi.encodeWithSelector(TreasurySetup.NoDelayMastercopy.selector, address(0xDE1A7)));
		// Through the factory too.
		vm.expectRevert();
		factory.createProxyWithNonce(safeL2, _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, c), 81);
	}

	/// A timelock that misreports any one of its settings, or doesn't enable the recovery Safe, is refused: each
	/// fake fails exactly one of setup's checks.
	function test_P18_misconfiguredDelayRefused() public {
		TreasurySetup.Config memory c = _config(_admins(), 2);
		for (uint8 lie = 0; lie <= 7; ++lie) {
			c.delayMastercopy = address(new FakeDelay(lie));
			address clone = Clones.predictDeterministicAddress(c.delayMastercopy, setupHelper.DELAY_SALT(), address(this));
			(bool ok, bytes memory ret) = _setupFromHere(c);
			assertFalse(ok);
			assertEq(ret, abi.encodeWithSelector(TreasurySetup.DelayNotConfigured.selector, clone));
		}
	}

	/* ==================================================================================== gas (report only) */

	function test_gasReport() public {
		bytes memory init = _treasuryInitializer(_owners3(member, address(passkey), cosigner), 2, _config(_admins(), 2));
		uint256 g = gasleft();
		factory.createProxyWithNonce(safeL2, init, 1234);
		emit log_named_uint('create treasury + timelock + recovery Safe (gas)', g - gasleft());

		bytes memory data = _transferData(recipient, 1e6);
		bytes memory sigs = _sign(treasury, _signers(_s(member), _s(cosigner)), address(token), 0, data, Operation.Call);
		g = gasleft();
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		emit log_named_uint('token transfer, EOA member + co-signer (gas)', g - gasleft());

		sigs = _sign(treasury, _signers(_s(address(passkey)), _s(cosigner)), address(token), 0, data, Operation.Call);
		g = gasleft();
		_exec(treasury, address(token), 0, data, Operation.Call, sigs);
		emit log_named_uint('token transfer, contract-signature member + co-signer (gas, mock verifier)', g - gasleft());
	}
}
