// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ISafeGuard, ISafeView, IERC165, Operation} from './interfaces/ISafe.sol';

/**
 * @title TreasuryGuard
 *
 * Safe v1.4.1 transaction guard for Paycrest company treasuries (KAN-925, KAN-1042).
 *
 * A treasury is a Safe whose owners are the business's member passkeys plus one Paycrest co-signer key, with a
 * threshold of 2. This guard makes the co-signer mandatory on the normal path: `execTransaction` only goes
 * through when one of the signatures Safe counted (the first `threshold` of them) is the co-signer's. So two
 * member passkeys cannot move funds without Paycrest's policy check, and, because the threshold must be at
 * least 2 and Safe counts each owner once, Paycrest's key cannot move funds alone either.
 *
 * Every co-signature also expires on-chain. A Safe transaction has no deadline of its own, so the co-signer
 * appends a deadline attestation after the signatures Safe checks: the last 97 bytes of `signatures` are
 * `uint256 deadline ‖ r ‖ s ‖ v`, the co-signer's ECDSA signature over `deadlineDigest(safeTxHash, deadline)`.
 * The guard refuses the transaction once `block.timestamp > deadline`, so a co-signature that expired off-chain
 * (or was superseded after expiring) can't be executed later by whoever holds it. Safe itself ignores bytes past
 * the signatures it reads, so the attestation doesn't change Safe's own check. The co-signer must be an EOA:
 * the attestation is recovered with `ecrecover`.
 *
 * Module transactions (`execTransactionFromModule`) never call a guard in Safe v1.4.1. The treasury's recovery
 * path is a module (a timelocked Zodiac Delay controlled by the business's admins), so recovery works without
 * Paycrest, and can remove this guard or replace the co-signer if either ever misbehaves.
 *
 * One deployment serves every treasury: each Safe registers its own co-signer, keyed by the Safe's address,
 * by calling `setCosigner` from itself (in its setup, or later through a co-signed transaction or recovery).
 * There is no owner, admin, upgrade path or pause.
 *
 * The guard trusts Safe's own signature check, which runs before `checkTransaction`: it only identifies which
 * owner each counted signature belongs to, using the same encoding rules as `Safe.checkNSignatures`.
 */
contract TreasuryGuard is ISafeGuard {
	/// @notice EIP-712-style type hash of the deadline attestation.
	bytes32 public constant DEADLINE_TYPEHASH = keccak256('TreasuryDeadline(bytes32 safeTxHash,uint256 deadline)');
	/// @notice Length of the attestation at the end of `signatures`: deadline (32) ‖ r (32) ‖ s (32) ‖ v (1).
	uint256 public constant ATTESTATION_LENGTH = 97;
	/// @notice Safe v1.4.1's fallback handler slot: keccak256("fallback_manager.handler.address").
	bytes32 public constant FALLBACK_HANDLER_SLOT = 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

	/// @notice The co-signer each Safe registered for itself.
	mapping(address => address) private _cosigners;

	/// @notice A Safe registered (or replaced) its co-signer.
	event CosignerSet(address indexed safe, address indexed cosigner);

	/// @notice The calling Safe has not registered a co-signer: every transaction is refused (fail closed).
	error CosignerNotSet(address safe);
	/// @notice The co-signer being registered is the zero address.
	error ZeroCosigner();
	/// @notice The co-signer being registered is not an owner of the calling Safe.
	error CosignerNotOwner(address safe, address cosigner);
	/// @notice The Safe's threshold is below 2, so the co-signer could act alone.
	error ThresholdTooLow(uint256 threshold);
	/// @notice None of the signatures Safe counted is the co-signer's.
	error MissingCosignerSignature(address safe, address cosigner);
	/// @notice The caller did not return a transaction hash, or its call has `data` end before byte 0x144, where
	/// the ten head words `getTransactionHash` takes end (it is not a Safe v1.4.1).
	error TransactionHashUnavailable(address safe);
	/// @notice `signatures` has no room for a deadline attestation after the counted signatures.
	error DeadlineAttestationMissing(address safe);
	/// @notice The deadline attestation is not the co-signer's signature over this transaction and deadline.
	error InvalidDeadlineAttestation(address safe, address cosigner);
	/// @notice The co-signature's deadline has passed.
	error CosignatureExpired(uint256 deadline, uint256 timestamp);
	/// @notice A normal-path transaction left the Safe with a fallback handler (P17).
	error FallbackHandlerSet(address safe, address handler);

	/// @notice The digest the co-signer signs to give the Safe transaction `safeTxHash` a deadline. `safeTxHash`
	/// already commits to the chain, the Safe and the nonce.
	function deadlineDigest(bytes32 safeTxHash, uint256 deadline) public pure returns (bytes32) {
		return keccak256(abi.encode(DEADLINE_TYPEHASH, safeTxHash, deadline));
	}

	/// @notice The co-signer `safe` registered, or the zero address.
	function cosignerOf(address safe) external view returns (address) {
		return _cosigners[safe];
	}

	/**
	 * @notice Register the calling Safe's co-signer. Must be called by the Safe itself; `cosigner` must already
	 * be one of its owners. Replacing it later (key rotation) is the same call, made after `swapOwner`.
	 */
	function setCosigner(address cosigner) external {
		if (cosigner == address(0)) revert ZeroCosigner();
		if (!ISafeView(msg.sender).isOwner(cosigner)) revert CosignerNotOwner(msg.sender, cosigner);
		_cosigners[msg.sender] = cosigner;
		emit CosignerSet(msg.sender, cosigner);
	}

	/**
	 * @inheritdoc ISafeGuard
	 * @dev Called by the Safe (`msg.sender`) after it has checked the signatures and increased its nonce, so
	 * the transaction's hash is the one for `nonce() - 1`.
	 */
	function checkTransaction(
		address,
		uint256,
		bytes memory,
		Operation,
		uint256,
		uint256,
		uint256,
		address,
		address payable,
		bytes memory signatures,
		address
	) external view override {
		address cosigner = _cosigners[msg.sender];
		if (cosigner == address(0)) revert CosignerNotSet(msg.sender);
		uint256 threshold = ISafeView(msg.sender).getThreshold();
		if (threshold < 2) revert ThresholdTooLow(threshold);
		bytes32 txHash = _safeTxHash(ISafeView(msg.sender).nonce() - 1);
		// The `threshold` static parts Safe read, then the attestation: both helpers below read within this.
		if (signatures.length < threshold * 65 + ATTESTATION_LENGTH) revert DeadlineAttestationMissing(msg.sender);
		if (!_countedSigner(signatures, threshold, txHash, cosigner)) {
			revert MissingCosignerSignature(msg.sender, cosigner);
		}
		_checkDeadline(signatures, txHash, cosigner);
	}

	/**
	 * @inheritdoc ISafeGuard
	 * @dev P17: a treasury has no fallback handler, so it answers no ERC-1271 `isValidSignature` (which Safe's
	 * handler would accept with `threshold` owner signatures, never consulting this guard: members could sign
	 * token permits and off-chain orders without the co-signer). Setup starts without one; this refuses any
	 * normal-path transaction that leaves one set, including one pointing at this guard. Safe calls this hook on
	 * the guard it read before execution, so a transaction that also removes the guard is checked too.
	 */
	function checkAfterExecution(bytes32, bool) external view override {
		bytes memory word = ISafeView(msg.sender).getStorageAt(uint256(FALLBACK_HANDLER_SLOT), 1);
		address handler = abi.decode(word, (address));
		if (handler != address(0)) revert FallbackHandlerSet(msg.sender, handler);
	}

	/// @inheritdoc IERC165
	function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
		return interfaceId == type(ISafeGuard).interfaceId || interfaceId == type(IERC165).interfaceId;
	}

	/**
	 * @dev The Safe's own hash of the transaction being checked, from `getTransactionHash` on the calling Safe.
	 * The first nine ABI head words of `checkTransaction` (to … refundReceiver, with `data`'s offset) are exactly
	 * those of `getTransactionHash`; word nine (`signatures`' offset) becomes the nonce. `data` stays where its
	 * offset points, the call ends where `data` does, and the decoder ignores word ten, so the Safe hashes the same
	 * transaction it just verified. Passing the head through avoids re-implementing Safe's EIP-712 encoding here.
	 */
	function _safeTxHash(uint256 txNonce) private view returns (bytes32) {
		// The call is cut where `data` ends, so a Safe's `signatures` (which follow `data`) are not sent again. Head
		// word 2 is `data`'s offset; the decoder has already checked that `data` lies within the calldata.
		uint256 end;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			let start := add(4, calldataload(0x44))
			end := add(add(start, 0x20), calldataload(start))
		}
		// The nonce goes in word 9, so the payload must hold getTransactionHash's ten head words: a Safe's own
		// encoding always does (its `data` follows all eleven), so anything shorter is not a Safe.
		if (end < 0x144) revert TransactionHashUnavailable(msg.sender);
		bytes memory payload = bytes.concat(ISafeView.getTransactionHash.selector, msg.data[4:end]);
		// solhint-disable-next-line no-inline-assembly
		assembly {
			// payload: 32-byte length, 4-byte selector, then head words; word 9 starts at 0x20 + 4 + 9 * 0x20.
			mstore(add(payload, 0x144), txNonce)
		}
		(bool ok, bytes memory ret) = msg.sender.staticcall(payload);
		if (!ok || ret.length != 32) revert TransactionHashUnavailable(msg.sender);
		return abi.decode(ret, (bytes32));
	}

	/**
	 * @dev Require the deadline attestation at the end of `signatures` to be the co-signer's, for `txHash`, and
	 * not expired. `checkTransaction` has checked it starts after the static parts Safe read; contract
	 * signatures' dynamic parts sit between the two, at the offsets their static parts name.
	 */
	function _checkDeadline(bytes memory signatures, bytes32 txHash, address cosigner) private view {
		uint256 len = signatures.length;
		uint256 deadline;
		bytes32 r;
		bytes32 s;
		uint8 v;
		// solhint-disable-next-line no-inline-assembly
		assembly {
			let p := add(add(signatures, 0x20), sub(len, 97))
			deadline := mload(p)
			r := mload(add(p, 0x20))
			s := mload(add(p, 0x40))
			v := byte(0, mload(add(p, 0x60)))
		}
		if (ecrecover(deadlineDigest(txHash, deadline), v, r, s) != cosigner) {
			revert InvalidDeadlineAttestation(msg.sender, cosigner);
		}
		// solhint-disable-next-line not-rely-on-time
		if (block.timestamp > deadline) revert CosignatureExpired(deadline, block.timestamp);
	}

	/**
	 * @dev True if one of the first `count` 65-byte signatures belongs to `signer` (`signatures` holds at least
	 * that many: `checkTransaction` checked its length). Owner identification
	 * mirrors `Safe.checkNSignatures`: `v == 0` (contract signature) and `v == 1` (approved hash) carry the
	 * owner in `r`; `v > 30` is an eth_sign signature over the prefixed hash; anything else is a plain ECDSA
	 * signature over the hash. Signatures past `count` are ignored because Safe does not check them.
	 */
	function _countedSigner(
		bytes memory signatures,
		uint256 count,
		bytes32 txHash,
		address signer
	) private pure returns (bool) {
		for (uint256 i = 0; i < count; ++i) {
			uint8 v;
			bytes32 r;
			bytes32 s;
			// solhint-disable-next-line no-inline-assembly
			assembly {
				let pos := mul(0x41, i)
				r := mload(add(signatures, add(pos, 0x20)))
				s := mload(add(signatures, add(pos, 0x40)))
				v := and(mload(add(signatures, add(pos, 0x41))), 0xff)
			}
			address owner;
			if (v == 0 || v == 1) {
				owner = address(uint160(uint256(r)));
			} else if (v > 30) {
				owner = ecrecover(keccak256(abi.encodePacked('\x19Ethereum Signed Message:\n32', txHash)), v - 4, r, s);
			} else {
				owner = ecrecover(txHash, v, r, s);
			}
			if (owner == signer) return true;
		}
		return false;
	}
}
