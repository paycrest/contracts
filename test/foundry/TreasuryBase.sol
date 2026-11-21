// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import 'forge-std/Test.sol';
import {TreasuryGuard} from '../../contracts/TreasuryGuard.sol';
import {TreasurySetup} from '../../contracts/TreasurySetup.sol';
import {ISafeSetup, ISafeView, ISafeProxyFactory, IDelay, Operation} from '../../contracts/interfaces/ISafe.sol';

/// @notice The rest of the Safe v1.4.1 surface the tests drive.
interface ISafe is ISafeSetup {
	function execTransaction(
		address to,
		uint256 value,
		bytes calldata data,
		Operation operation,
		uint256 safeTxGas,
		uint256 baseGas,
		uint256 gasPrice,
		address gasToken,
		address payable refundReceiver,
		bytes memory signatures
	) external payable returns (bool success);

	function encodeTransactionData(
		address to,
		uint256 value,
		bytes calldata data,
		Operation operation,
		uint256 safeTxGas,
		uint256 baseGas,
		uint256 gasPrice,
		address gasToken,
		address refundReceiver,
		uint256 _nonce
	) external view returns (bytes memory);

	function getOwners() external view returns (address[] memory);

	function approveHash(bytes32 hashToApprove) external;

	function swapOwner(address prevOwner, address oldOwner, address newOwner) external;

	function changeThreshold(uint256 threshold) external;

	function execTransactionFromModule(address to, uint256 value, bytes memory data, Operation operation) external returns (bool);

	function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array, address next);

	function disableModule(address prevModule, address module) external;
}

interface IMultiSend {
	function multiSend(bytes memory transactions) external payable;
}

/// @notice Stands in for Safe's WebAuthn signer: a contract owner that signs with the legacy EIP-1271 interface
/// Safe v1.4.1 calls. The test "touches the passkey" by approving the transaction data.
contract MockPasskey {
	bytes4 internal constant LEGACY_MAGIC = 0x20c13b0b;
	mapping(bytes32 => bool) public approved;

	function approve(bytes memory data) external {
		approved[keccak256(data)] = true;
	}

	function isValidSignature(bytes memory data, bytes memory) external view returns (bytes4) {
		return approved[keccak256(data)] ? LEGACY_MAGIC : bytes4(0);
	}
}

/// @notice Minimal ERC-20 for treasury balances.
contract TestToken {
	mapping(address => uint256) public balanceOf;

	function mint(address to, uint256 amount) external {
		balanceOf[to] += amount;
	}

	function transfer(address to, uint256 amount) external returns (bool) {
		require(balanceOf[msg.sender] >= amount, 'balance');
		balanceOf[msg.sender] -= amount;
		balanceOf[to] += amount;
		return true;
	}
}

/// @notice Shared fixture: the real Safe v1.4.1 and Zodiac Delay 1.0.0 bytecode, a guard, a setup helper, and a
/// treasury of one EOA member, one passkey member and the Paycrest co-signer, recoverable by three admins (2 of 3).
abstract contract TreasuryBase is Test {
	/// Safe v1.4.1 guard slot: keccak256("guard_manager.guard.address").
	bytes32 internal constant GUARD_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
	/// Safe v1.4.1 fallback handler slot, derived here rather than read from the contracts under test.
	bytes32 internal constant HANDLER_SLOT = keccak256('fallback_manager.handler.address');
	address internal constant SENTINEL = address(1);
	uint256 internal constant COOLDOWN = 48 hours;
	uint256 internal constant EXPIRATION = 7 days;
	/// How long the tests' co-signatures stay valid (the co-signer service's maximum TTL).
	uint256 internal constant COSIGN_TTL = 15 minutes;
	/// Runtime code hash of Zodiac's Delay 1.0.0 mastercopy (as deployed from the fixture).
	bytes32 internal constant DELAY_RUNTIME_HASH = 0x7967a56259946057a84885ca4c3e427007d37fff3abe632a10ac764987c0297c;

	// Real bytecode
	address internal safeL2;
	address internal safeL1;
	ISafeProxyFactory internal factory;
	address internal fallbackHandler;
	address internal multiSendCallOnly;
	address internal delayMastercopy;

	TreasuryGuard internal guard;
	TreasurySetup internal setupHelper;
	TestToken internal token;

	// Keys
	uint256 internal memberPk = 0xA11CE;
	uint256 internal cosignerPk = 0xC0516;
	uint256 internal newCosignerPk = 0xC0517;
	uint256 internal admin1Pk = 0xAD1;
	uint256 internal admin2Pk = 0xAD2;
	uint256 internal admin3Pk = 0xAD3;
	address internal member;
	address internal cosigner;
	address internal newCosigner;
	address internal admin1;
	address internal admin2;
	address internal admin3;
	MockPasskey internal passkey;
	address internal keeper = address(0x6EE9E2);
	address internal recipient = address(0xBEEF);

	mapping(address => uint256) internal keyOf;

	// The default treasury
	ISafe internal treasury;
	IDelay internal delay;
	ISafe internal recovery;

	function setUp() public virtual {
		safeL2 = _deployFixture('SafeL2', '');
		safeL1 = _deployFixture('Safe', '');
		factory = ISafeProxyFactory(_deployFixture('SafeProxyFactory', ''));
		fallbackHandler = _deployFixture('CompatibilityFallbackHandler', '');
		multiSendCallOnly = _deployFixture('MultiSendCallOnly', '');
		// The canonical mastercopy was deployed with these constructor arguments.
		delayMastercopy = _deployFixture('Delay', abi.encode(address(1), address(1), address(1), uint256(1), uint256(0)));

		guard = new TreasuryGuard();
		setupHelper = new TreasurySetup();
		token = new TestToken();
		passkey = new MockPasskey();

		member = _key(memberPk);
		cosigner = _key(cosignerPk);
		newCosigner = _key(newCosignerPk);
		admin1 = _key(admin1Pk);
		admin2 = _key(admin2Pk);
		admin3 = _key(admin3Pk);

		treasury = ISafe(_createTreasury(_owners3(member, address(passkey), cosigner), 2, _admins(), 2, 0, safeL2));
		(delay, recovery) = _recoveryOf(address(treasury));
		vm.deal(address(treasury), 10 ether);
		token.mint(address(treasury), 1_000_000e6);
		vm.warp(1_800_000_000);
	}

	/* ------------------------------------------------------------------ fixtures */

	function _fixtureJson(string memory name) internal view returns (string memory) {
		return vm.readFile(string.concat(vm.projectRoot(), '/test/foundry/fixtures/treasury/', name, '.json'));
	}

	function _deployFixture(string memory name, bytes memory args) internal returns (address a) {
		bytes memory code = bytes.concat(vm.parseJsonBytes(_fixtureJson(name), '.bytecode'), args);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			a := create(0, add(code, 0x20), mload(code))
		}
		require(a != address(0), name);
	}

	function _key(uint256 pk) internal returns (address a) {
		a = vm.addr(pk);
		keyOf[a] = pk;
	}

	/* ------------------------------------------------------------------ treasuries */

	function _owners3(address a, address b, address c) internal pure returns (address[] memory o) {
		o = new address[](3);
		o[0] = a;
		o[1] = b;
		o[2] = c;
	}

	function _admins() internal view returns (address[] memory a) {
		a = new address[](3);
		a[0] = admin1;
		a[1] = admin2;
		a[2] = admin3;
	}

	function _config(address[] memory admins, uint256 adminThreshold) internal view returns (TreasurySetup.Config memory c) {
		c = TreasurySetup.Config({
			guard: address(guard),
			cosigner: cosigner,
			delayMastercopy: delayMastercopy,
			recoveryCooldown: COOLDOWN,
			recoveryExpiration: EXPIRATION,
			safeProxyFactory: address(factory),
			safeSingleton: safeL2,
			fallbackHandler: fallbackHandler,
			recoveryOwners: admins,
			recoveryThreshold: adminThreshold
		});
	}

	function _treasuryInitializer(
		address[] memory owners,
		uint256 threshold,
		TreasurySetup.Config memory c
	) internal view returns (bytes memory) {
		return
			abi.encodeCall(
				ISafeSetup.setup,
				(
					owners,
					threshold,
					address(setupHelper),
					abi.encodeCall(TreasurySetup.setupTreasury, (c)),
					address(0), // no fallback handler: a treasury answers no ERC-1271 (P17)
					address(0),
					0,
					payable(address(0))
				)
			);
	}

	function _createTreasury(
		address[] memory owners,
		uint256 threshold,
		address[] memory admins,
		uint256 adminThreshold,
		uint256 salt,
		address singleton
	) internal returns (address) {
		return factory.createProxyWithNonce(singleton, _treasuryInitializer(owners, threshold, _config(admins, adminThreshold)), salt);
	}

	/// @dev Safe v1.4.1 `SafeProxyFactory` CREATE2 address.
	function _predictSafe(address singleton, bytes memory initializer, uint256 salt) internal view returns (address) {
		bytes32 s = keccak256(abi.encodePacked(keccak256(initializer), salt));
		bytes32 initCodeHash = keccak256(abi.encodePacked(factory.proxyCreationCode(), uint256(uint160(singleton))));
		return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), s, initCodeHash)))));
	}

	function _recoveryOf(address t) internal view returns (IDelay d, ISafe r) {
		(address[] memory mods, ) = ISafe(t).getModulesPaginated(SENTINEL, 10);
		require(mods.length == 1, 'one module');
		d = IDelay(mods[0]);
		(address[] memory dmods, ) = ISafe(address(d)).getModulesPaginated(SENTINEL, 10);
		require(dmods.length == 1, 'one delay module');
		r = ISafe(dmods[0]);
	}

	/* ------------------------------------------------------------------ signing */

	enum Kind {
		Ecdsa, // v in {27, 28}
		EthSign, // v > 30
		Approved, // v == 1 via approveHash
		Contract // v == 0 (passkey)
	}

	struct Signer {
		address owner;
		Kind kind;
	}

	function _s(address owner) internal view returns (Signer memory) {
		return Signer(owner, owner.code.length > 0 ? Kind.Contract : Kind.Ecdsa);
	}

	function _s(address owner, Kind kind) internal pure returns (Signer memory) {
		return Signer(owner, kind);
	}

	/// @notice A Safe transaction's fields plus nonce, in `getTransactionHash` / `encodeTransactionData` order.
	struct SafeTx {
		address to;
		uint256 value;
		bytes data;
		Operation operation;
		uint256 safeTxGas;
		uint256 baseGas;
		uint256 gasPrice;
		address gasToken;
		address refundReceiver;
		uint256 nonce;
	}

	/// @dev Calldata for `sel(fields of the struct)`: `abi.encode(struct)` is one offset word followed by the
	/// tuple, and the tuple is exactly the flat argument encoding. (Avoids stack-too-deep on 10-argument calls.)
	function _flat(bytes4 sel, bytes memory encodedStruct) internal pure returns (bytes memory cd) {
		uint256 len = encodedStruct.length - 32;
		// Allocate 32 spare bytes for the word-wise copy, then set the real length.
		cd = new bytes(4 + len + 32);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			mstore(add(cd, 0x20), sel)
			let src := add(encodedStruct, 0x40)
			let dst := add(cd, 0x24)
			for {
				let i := 0
			} lt(i, len) {
				i := add(i, 0x20)
			} {
				mstore(add(dst, i), mload(add(src, i)))
			}
			mstore(cd, add(4, len))
		}
	}

	function _safeView(ISafe safe, bytes4 sel, SafeTx memory t) internal view returns (bytes memory) {
		(bool ok, bytes memory ret) = address(safe).staticcall(_flat(sel, abi.encode(t)));
		require(ok, 'safe view');
		return ret;
	}

	function _txHash(ISafe safe, SafeTx memory t) internal view returns (bytes32) {
		return abi.decode(_safeView(safe, ISafeView.getTransactionHash.selector, t), (bytes32));
	}

	function _simple(ISafe safe, address to, uint256 value, bytes memory data, Operation op) internal view returns (SafeTx memory) {
		return SafeTx(to, value, data, op, 0, 0, 0, address(0), address(0), safe.nonce());
	}

	function _hash(ISafe safe, address to, uint256 value, bytes memory data, Operation op) internal view returns (bytes32) {
		return _txHash(safe, _simple(safe, to, value, data, op));
	}

	/// @dev Sign the Safe's next transaction with `signers` and pack the signatures the way Safe expects:
	/// static parts sorted by owner, contract signatures' bytes appended after them.
	function _sign(
		ISafe safe,
		Signer[] memory signers,
		address to,
		uint256 value,
		bytes memory data,
		Operation op
	) internal returns (bytes memory) {
		uint256 n = signers.length;
		for (uint256 i = 1; i < n; ++i) {
			for (uint256 j = i; j > 0 && signers[j - 1].owner > signers[j].owner; --j) {
				(signers[j - 1], signers[j]) = (signers[j], signers[j - 1]);
			}
		}
		bytes32 h = _hash(safe, to, value, data, op);
		bytes memory txData = _txData(safe, to, value, data, op);
		bytes memory statics;
		bytes memory dynamics;
		for (uint256 i = 0; i < n; ++i) {
			(bytes memory st, bytes memory dyn) = _part(safe, signers[i], h, txData, n * 65 + dynamics.length);
			statics = bytes.concat(statics, st);
			dynamics = bytes.concat(dynamics, dyn);
		}
		return bytes.concat(statics, dynamics, _autoAttestation(safe, h));
	}

	/// @dev The deadline digest, computed here independently of the guard (no external call, so it is safe to
	/// use inside an `expectRevert`).
	function _deadlineDigest(bytes32 h, uint256 deadline) internal pure returns (bytes32) {
		return keccak256(abi.encode(keccak256('TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)'), h, deadline));
	}

	/// @dev The co-signer's deadline attestation for `h`: deadline ‖ r ‖ s ‖ v, signed with `pk`.
	function _attestation(uint256 pk, bytes32 h, uint256 deadline) internal pure returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _deadlineDigest(h, deadline));
		return bytes.concat(bytes32(deadline), r, s, bytes1(v));
	}

	/// @dev `sigs` (as `_sign` packed them, with an attestation at the end) with that attestation replaced.
	function _reattest(bytes memory sigs, uint256 pk, bytes32 h, uint256 deadline) internal pure returns (bytes memory) {
		return bytes.concat(_stripAttestation(sigs), _attestation(pk, h, deadline));
	}

	/// @dev `sigs` without its trailing attestation.
	function _stripAttestation(bytes memory sigs) internal pure returns (bytes memory out) {
		out = new bytes(sigs.length - 97);
		for (uint256 i = 0; i < out.length; ++i) out[i] = sigs[i];
	}

	/// @dev A valid attestation for the registered co-signer of a Safe that uses the guard, expiring after
	/// `COSIGN_TTL`; empty for a Safe without the guard (the recovery Safe) or a co-signer with no test key.
	function _autoAttestation(ISafe safe, bytes32 h) internal view returns (bytes memory) {
		if (address(uint160(uint256(vm.load(address(safe), GUARD_SLOT)))) != address(guard)) return '';
		uint256 pk = keyOf[guard.cosignerOf(address(safe))];
		if (pk == 0) return '';
		return _attestation(pk, h, block.timestamp + COSIGN_TTL);
	}

	function _txData(ISafe safe, address to, uint256 value, bytes memory data, Operation op) internal view returns (bytes memory) {
		return abi.decode(_safeView(safe, ISafe.encodeTransactionData.selector, _simple(safe, to, value, data, op)), (bytes));
	}

	/// @dev One owner's 65-byte static part, plus its dynamic part for a contract signature at `offset`.
	function _part(
		ISafe safe,
		Signer memory sg,
		bytes32 h,
		bytes memory txData,
		uint256 offset
	) internal returns (bytes memory st, bytes memory dyn) {
		if (sg.kind == Kind.Contract) {
			MockPasskey(sg.owner).approve(txData);
			bytes memory sig = bytes('passkey-assertion');
			st = bytes.concat(bytes32(uint256(uint160(sg.owner))), bytes32(offset), bytes1(0));
			dyn = bytes.concat(bytes32(sig.length), sig);
		} else if (sg.kind == Kind.Approved) {
			vm.prank(sg.owner);
			safe.approveHash(h);
			st = bytes.concat(bytes32(uint256(uint160(sg.owner))), bytes32(0), bytes1(0x01));
		} else if (sg.kind == Kind.EthSign) {
			(uint8 v, bytes32 r, bytes32 s) = vm.sign(keyOf[sg.owner], keccak256(abi.encodePacked('\x19Ethereum Signed Message:\n32', h)));
			st = bytes.concat(r, s, bytes1(v + 4));
		} else {
			(uint8 v, bytes32 r, bytes32 s) = vm.sign(keyOf[sg.owner], h);
			st = bytes.concat(r, s, bytes1(v));
		}
	}

	function _signers(Signer memory a) internal pure returns (Signer[] memory s) {
		s = new Signer[](1);
		s[0] = a;
	}

	function _signers(Signer memory a, Signer memory b) internal pure returns (Signer[] memory s) {
		s = new Signer[](2);
		s[0] = a;
		s[1] = b;
	}

	function _signers(Signer memory a, Signer memory b, Signer memory c) internal pure returns (Signer[] memory s) {
		s = new Signer[](3);
		s[0] = a;
		s[1] = b;
		s[2] = c;
	}

	/// @dev Submit as the keeper.
	function _exec(ISafe safe, address to, uint256 value, bytes memory data, Operation op, bytes memory sigs) internal returns (bool) {
		vm.prank(keeper);
		return safe.execTransaction(to, value, data, op, 0, 0, 0, address(0), payable(address(0)), sigs);
	}

	function _signAndExec(ISafe safe, Signer[] memory signers, address to, uint256 value, bytes memory data, Operation op) internal returns (bool) {
		bytes memory sigs = _sign(safe, signers, to, value, data, op);
		return _exec(safe, to, value, data, op, sigs);
	}

	function _transferData(address to, uint256 amount) internal pure returns (bytes memory) {
		return abi.encodeCall(TestToken.transfer, (to, amount));
	}

	/// @dev MultiSendCallOnly payload.
	function _multi(address[] memory tos, bytes[] memory datas) internal pure returns (bytes memory txs) {
		for (uint256 i = 0; i < tos.length; ++i) {
			txs = bytes.concat(txs, abi.encodePacked(uint8(0), tos[i], uint256(0), uint256(datas[i].length), datas[i]));
		}
		return abi.encodeCall(IMultiSend.multiSend, (txs));
	}

	function _missing(address safe) internal view returns (bytes memory) {
		return abi.encodeWithSelector(TreasuryGuard.MissingCosignerSignature.selector, safe, guard.cosignerOf(safe));
	}

	/* ------------------------------------------------------------------ recovery */

	/// @dev Queue `to/data` on the treasury's timelock through the recovery Safe (signed by `admins`).
	function _queueRecovery(Signer[] memory admins, address to, uint256 value, bytes memory data, Operation op) internal {
		bytes memory q = abi.encodeCall(IDelay.execTransactionFromModule, (to, value, data, op));
		assertTrue(_signAndExec(recovery, admins, address(delay), 0, q, Operation.Call), 'queue');
	}
}
