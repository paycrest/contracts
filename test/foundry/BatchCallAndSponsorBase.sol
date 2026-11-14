// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from 'forge-std/Test.sol';
import {BatchCallAndSponsor} from '../../contracts/BatchCallAndSponsor.sol';
import {MockUSDT} from '../../contracts/mocks/MockUSDC.sol';

/// @dev A call target that records what it received.
contract Recorder {
	address public lastSender;
	uint256 public lastValue;
	bytes public lastData;
	uint256 public calls;

	function record(bytes calldata payload) external payable {
		lastSender = msg.sender;
		lastValue = msg.value;
		lastData = payload;
		calls++;
	}
}

/// @dev A call target that always reverts with a reason, or plainly.
contract Reverter {
	error Nope(uint256 code);

	function fail(uint256 code) external pure {
		revert Nope(code);
	}

	function failPlain() external pure {
		revert();
	}
}

/// @dev A call target that tries to re-enter the account with whatever it is given.
contract Reentrant {
	address public account;
	bytes public payload;
	bool public reentered;
	bool public reentryOk;

	function arm(address account_, bytes calldata payload_) external {
		account = account_;
		payload = payload_;
	}

	function poke() external {
		reentered = true;
		(reentryOk, ) = account.call(payload);
	}
}

/**
 * @title BatchCallAndSponsorBase
 * @notice Shared fixture. The delegate's code is placed at an EOA with `vm.etch`, which for this contract is
 * equivalent to an EIP-7702 delegation: the code runs with `address(this) == account` and its storage is the
 * account's. The EIP-712 encoding is re-implemented here, independently of the contract, so the tests pin
 * what an off-chain signer must produce rather than trusting the contract's own hashing.
 */
abstract contract BatchCallAndSponsorBase is Test {
	bytes32 internal constant DOMAIN_TYPEHASH =
		keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
	bytes32 internal constant CALL_TYPEHASH = keccak256('Call(address to,uint256 value,bytes data)');
	bytes32 internal constant EXECUTE_TYPEHASH =
		keccak256('Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)');
	/// ERC-7201 slot for namespace "paycrest.storage.BatchCallAndSponsor".
	bytes32 internal constant NONCE_SLOT = 0x2a03703f9fa6511871e434e639db8aefa945f9df0ac4204077804f0a35d36500;
	uint256 internal constant HALF_ORDER = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

	BatchCallAndSponsor internal impl;
	uint256 internal accountPk;
	address internal account;
	uint256 internal otherPk;
	address internal other;
	address internal relayer;
	MockUSDT internal token;
	Recorder internal recorder;
	Reverter internal reverter;

	function setUp() public virtual {
		impl = new BatchCallAndSponsor();
		accountPk = 0xA11CE;
		account = vm.addr(accountPk);
		otherPk = 0xB0B;
		other = vm.addr(otherPk);
		relayer = makeAddr('relayer');
		vm.etch(account, address(impl).code);
		vm.etch(other, address(impl).code);

		token = new MockUSDT();
		token.transfer(account, 1_000e18);
		vm.deal(account, 10 ether);
		recorder = new Recorder();
		reverter = new Reverter();
		vm.warp(1_800_000_000);
	}

	/* ---------------------------------------------------------------- EIP-712, re-implemented */

	function domainSeparatorFor(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
		return
			keccak256(
				abi.encode(
					DOMAIN_TYPEHASH,
					keccak256('BatchCallAndSponsor'),
					keccak256('1'),
					chainId,
					verifyingContract
				)
			);
	}

	function hashCalls(BatchCallAndSponsor.Call[] memory calls) internal pure returns (bytes32) {
		bytes32[] memory hashes = new bytes32[](calls.length);
		for (uint256 i; i < calls.length; i++) {
			hashes[i] = keccak256(abi.encode(CALL_TYPEHASH, calls[i].to, calls[i].value, keccak256(calls[i].data)));
		}
		return keccak256(abi.encodePacked(hashes));
	}

	function digestFor(
		uint256 chainId,
		address verifyingContract,
		BatchCallAndSponsor.Call[] memory calls,
		uint256 nonce_,
		uint256 deadline
	) internal pure returns (bytes32) {
		bytes32 structHash = keccak256(abi.encode(EXECUTE_TYPEHASH, hashCalls(calls), nonce_, deadline));
		return keccak256(abi.encodePacked('\x19\x01', domainSeparatorFor(chainId, verifyingContract), structHash));
	}

	function digest(
		address acct,
		BatchCallAndSponsor.Call[] memory calls,
		uint256 nonce_,
		uint256 deadline
	) internal view returns (bytes32) {
		return digestFor(block.chainid, acct, calls, nonce_, deadline);
	}

	function signDigest(uint256 pk, bytes32 d) internal pure virtual returns (bytes memory) {
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
		return abi.encodePacked(r, s, v);
	}

	/// Signs `calls` for `acct` at its current nonce, on this chain.
	function signBatch(
		uint256 pk,
		address acct,
		BatchCallAndSponsor.Call[] memory calls,
		uint256 deadline
	) internal view returns (bytes memory) {
		return signDigest(pk, digest(acct, calls, nonceOf(acct), deadline));
	}

	/* ---------------------------------------------------------------- helpers */

	function nonceOf(address acct) internal view returns (uint256) {
		return uint256(vm.load(acct, NONCE_SLOT));
	}

	function bcs(address acct) internal pure returns (BatchCallAndSponsor) {
		return BatchCallAndSponsor(payable(acct));
	}

	function one(address to, uint256 value, bytes memory data) internal pure returns (BatchCallAndSponsor.Call[] memory c) {
		c = new BatchCallAndSponsor.Call[](1);
		c[0] = BatchCallAndSponsor.Call(to, value, data);
	}

	function tokenTransfer(address to, uint256 amount) internal view returns (BatchCallAndSponsor.Call[] memory) {
		return one(address(token), 0, abi.encodeCall(token.transfer, (to, amount)));
	}

	function exec(
		address acct,
		BatchCallAndSponsor.Call[] memory calls,
		uint256 deadline,
		bytes memory sig
	) internal returns (bool ok, bytes memory ret) {
		vm.prank(relayer);
		(ok, ret) = acct.call(abi.encodeCall(BatchCallAndSponsor.execute, (calls, deadline, sig)));
	}
}
