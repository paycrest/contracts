// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ProviderBatchCallAndSponsor
 *
 * @notice When an EOA authorizes this contract via EIP-7702, it runs in the EOA’s context (`address(this)` is the EOA).
 * @notice Batches are authorized with EIP-712: domain binds `chainId` and `verifyingContract`; the struct binds
 *         `nonce`, `deadline`, and `callsHash` where `callsHash = keccak256(abi.encode(calls))`.
 * @notice Signers must use EIP-712 typed data (not `personal_sign` over a raw digest). The contract recovers
 *         against the final `\x19\x01` digest without an additional EIP-191 wrapper.
 */
contract ProviderBatchCallAndSponsor {
    /// @dev keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)")
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    /// @dev keccak256("ProviderBatchCallAndSponsor")
    bytes32 private constant _NAME_HASH = keccak256("ProviderBatchCallAndSponsor");
    /// @dev keccak256("Batch(uint256 nonce,uint256 deadline,bytes32 callsHash)")
    bytes32 private constant _BATCH_TYPEHASH =
        keccak256("Batch(uint256 nonce,uint256 deadline,bytes32 callsHash)");

    /// @notice A nonce used for replay protection (included in the EIP-712 struct).
    uint256 public nonce;

    /// @notice Represents a single call within a batch.
    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    /// @notice Emitted for every individual call executed.
    event CallExecuted(address indexed sender, address indexed to, uint256 value, bytes data);
    /// @notice Emitted when a full batch is executed.
    event BatchExecuted(uint256 indexed nonce, Call[] calls);

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(_DOMAIN_TYPEHASH, _NAME_HASH, block.chainid, address(this)));
    }

    /**
     * @notice EIP-712 domain separator for this account and chain.
     */
    function domainSeparator() public view returns (bytes32) {
        return _domainSeparator();
    }

    /**
     * @notice Hash of the `Batch` struct for the current chain nonce (before `execute` increments it).
     * @param calls Same calldata as passed to `execute`; used to compute `callsHash`.
     */
    function hashTypedBatch(Call[] calldata calls, uint256 deadline) public view returns (bytes32 structHash) {
        uint256 currentNonce = nonce;
        bytes32 callsHash = keccak256(abi.encode(calls));
        structHash = keccak256(abi.encode(_BATCH_TYPEHASH, currentNonce, deadline, callsHash));
    }

    /**
     * @notice Full EIP-712 digest the EOA must sign (`eth_signTypedData` / `_TypedDataEncoder.hash`).
     */
    function digestForCurrentNonce(Call[] calldata calls, uint256 deadline) public view returns (bytes32) {
        return ECDSA.toTypedDataHash(_domainSeparator(), hashTypedBatch(calls, deadline));
    }

    /**
     * @notice Executes a batch of calls using an off-chain EIP-712 signature.
     * @param calls Calls to execute (must match what was hashed in `callsHash` when signing).
     * @param deadline Unix timestamp after which the signature is rejected.
     * @param signature ECDSA signature over `digestForCurrentNonce(calls, deadline)`.
     */
    function execute(Call[] calldata calls, uint256 deadline, bytes calldata signature) external payable {
        require(block.timestamp <= deadline, "Expired");

        uint256 currentNonce = nonce;
        bytes32 callsHash = keccak256(abi.encode(calls));
        bytes32 structHash = keccak256(abi.encode(_BATCH_TYPEHASH, currentNonce, deadline, callsHash));
        bytes32 digest = ECDSA.toTypedDataHash(_domainSeparator(), structHash);

        address recovered = ECDSA.recover(digest, signature);
        require(recovered == address(this), "Invalid signature");

        _executeBatch(calls);
    }

    /**
     * @dev Internal function that handles batch execution and nonce incrementation.
     */
    function _executeBatch(Call[] calldata calls) internal {
        uint256 currentNonce = nonce;
        nonce++;

        for (uint256 i = 0; i < calls.length; i++) {
            _executeCall(calls[i]);
        }

        emit BatchExecuted(currentNonce, calls);
    }

    /**
     * @dev Internal function to execute a single call.
     */
    function _executeCall(Call calldata callItem) internal {
        (bool success,) = callItem.to.call{value: callItem.value}(callItem.data);
        require(success, "Call reverted");
        emit CallExecuted(msg.sender, callItem.to, callItem.value, callItem.data);
    }

    fallback() external payable {}
    receive() external payable {}
}
