// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title BatchCallAndSponsor
 *
 * EIP-7702 delegate for Paycrest-managed accounts: order receive addresses, provider wallets and
 * Paycrest Wallets. An account delegates to this contract; anyone (a sponsor) can then submit a
 * batch of calls the account signed off-chain, paying the gas.
 *
 * The account signs EIP-712 typed data:
 *
 *   domain  = { name: "BatchCallAndSponsor", version: "1", chainId, verifyingContract: <the account> }
 *   Call    = (address to, uint256 value, bytes data)
 *   Execute = (Call[] calls, uint256 nonce, uint256 deadline)
 *
 * The chain id and the account's own address in the domain stop a signature from being replayed on
 * another network or for another account that delegates here; the deadline makes a signed batch
 * expire; the nonce makes it single-use. The domain separator is computed per call: under EIP-7702
 * this code runs in the account's context, where no constructor ever ran.
 *
 * Supersedes ProviderBatchCallAndSponsor, whose signature covered only keccak256(nonce, calls).
 */
contract BatchCallAndSponsor {
	/// @notice A single call within a batch.
	struct Call {
		address to;
		uint256 value;
		bytes data;
	}

	/// @custom:storage-location erc7201:paycrest.storage.BatchCallAndSponsor
	struct BatchCallAndSponsorStorage {
		uint256 nonce;
	}

	// keccak256(abi.encode(uint256(keccak256("paycrest.storage.BatchCallAndSponsor")) - 1)) & ~bytes32(uint256(0xff))
	bytes32 private constant STORAGE_LOCATION =
		0x2a03703f9fa6511871e434e639db8aefa945f9df0ac4204077804f0a35d36500;

	bytes32 private constant DOMAIN_TYPEHASH =
		keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
	bytes32 private constant NAME_HASH = keccak256("BatchCallAndSponsor");
	bytes32 private constant VERSION_HASH = keccak256("1");

	/// @notice keccak256("Call(address to,uint256 value,bytes data)")
	bytes32 public constant CALL_TYPEHASH = keccak256("Call(address to,uint256 value,bytes data)");

	/// @notice keccak256("Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)")
	bytes32 public constant EXECUTE_TYPEHASH =
		keccak256("Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)");

	/// @notice Emitted for every individual call executed.
	event CallExecuted(address indexed sender, address indexed to, uint256 value, bytes data);
	/// @notice Emitted when a full batch is executed.
	event BatchExecuted(uint256 indexed nonce, Call[] calls);

	/// @notice The batch's deadline has passed.
	error Expired(uint256 deadline, uint256 timestamp);
	/// @notice The signature is malformed or was not made by this account for this chain and nonce.
	error InvalidSignature();
	/// @notice A call in the batch reverted; the whole batch is reverted with it.
	error CallReverted(uint256 index, bytes reason);

	/**
	 * @notice Executes a batch of calls the account signed.
	 * @param calls The calls, executed in order.
	 * @param deadline Last block timestamp (inclusive) at which the batch may execute.
	 * @param signature The account's signature over the EIP-712 Execute struct with the current nonce.
	 */
	function execute(Call[] calldata calls, uint256 deadline, bytes calldata signature) external payable {
		if (block.timestamp > deadline) revert Expired(deadline, block.timestamp);

		BatchCallAndSponsorStorage storage $ = _storage();
		uint256 currentNonce = $.nonce;

		bytes32 digest = ECDSA.toTypedDataHash(_domainSeparator(), _hashExecute(calls, currentNonce, deadline));
		(address recovered, ECDSA.RecoverError err) = ECDSA.tryRecover(digest, signature);
		if (err != ECDSA.RecoverError.NoError || recovered != address(this)) revert InvalidSignature();

		$.nonce = currentNonce + 1;

		for (uint256 i = 0; i < calls.length; i++) {
			_executeCall(i, calls[i]);
		}

		emit BatchExecuted(currentNonce, calls);
	}

	/// @notice The nonce the next batch must be signed with.
	function nonce() external view returns (uint256) {
		return _storage().nonce;
	}

	/// @notice The EIP-712 domain separator for this account on this chain.
	function domainSeparator() external view returns (bytes32) {
		return _domainSeparator();
	}

	/// @notice Plain ETH transfers to the account (e.g. from DEX swaps).
	/// @dev No fallback on purpose: ProviderBatchCallAndSponsor's payable fallback() turned any call with an
	/// unknown selector into a successful no-op. Here, a ProviderBatchCallAndSponsor-format
	/// execute(calls, signature) relayed to an account on this delegate by mistake reverts instead of
	/// "succeeding" without moving anything. An empty fallback cannot serve token receive hooks either,
	/// since those require a return value.
	receive() external payable {}

	function _executeCall(uint256 index, Call calldata callItem) internal {
		(bool success, bytes memory reason) = callItem.to.call{value: callItem.value}(callItem.data);
		if (!success) revert CallReverted(index, reason);
		emit CallExecuted(msg.sender, callItem.to, callItem.value, callItem.data);
	}

	function _domainSeparator() internal view returns (bytes32) {
		return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
	}

	function _hashExecute(Call[] calldata calls, uint256 currentNonce, uint256 deadline) internal pure returns (bytes32) {
		bytes32[] memory callHashes = new bytes32[](calls.length);
		for (uint256 i = 0; i < calls.length; i++) {
			callHashes[i] = keccak256(
				abi.encode(CALL_TYPEHASH, calls[i].to, calls[i].value, keccak256(calls[i].data))
			);
		}
		return keccak256(abi.encode(EXECUTE_TYPEHASH, keccak256(abi.encodePacked(callHashes)), currentNonce, deadline));
	}

	function _storage() private pure returns (BatchCallAndSponsorStorage storage $) {
		bytes32 location = STORAGE_LOCATION;
		assembly {
			$.slot := location
		}
	}
}
