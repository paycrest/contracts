// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * Minimal Safe v1.4.1 and Zodiac Delay 1.0.0 interfaces used by the treasury contracts. Signatures match the
 * deployed contracts exactly (Safe's `Enum.Operation` is ABI-encoded as `uint8`), so selectors and the guard
 * interface id are the ones Safe checks.
 */

/// @notice Safe's `Enum.Operation`.
enum Operation {
	Call,
	DelegateCall
}

interface IERC165 {
	function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Safe v1.4.1 `Guard` (contracts/base/GuardManager.sol).
interface ISafeGuard is IERC165 {
	/// @notice Called by the Safe inside `execTransaction`, after the signature check; reverting blocks the transaction.
	function checkTransaction(
		address to,
		uint256 value,
		bytes memory data,
		Operation operation,
		uint256 safeTxGas,
		uint256 baseGas,
		uint256 gasPrice,
		address gasToken,
		address payable refundReceiver,
		bytes memory signatures,
		address msgSender
	) external;

	/// @notice Called by the Safe at the end of `execTransaction`.
	function checkAfterExecution(bytes32 txHash, bool success) external;
}

/// @notice The Safe v1.4.1 views the guard reads.
interface ISafeView {
	function nonce() external view returns (uint256);

	function getThreshold() external view returns (uint256);

	function isOwner(address owner) external view returns (bool);

	function getTransactionHash(
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
	) external view returns (bytes32);
}

/// @notice The Safe v1.4.1 calls the treasury setup makes on itself and on its recovery Safe.
interface ISafeSetup is ISafeView {
	function setup(
		address[] calldata owners,
		uint256 threshold,
		address to,
		bytes calldata data,
		address fallbackHandler,
		address paymentToken,
		uint256 payment,
		address payable paymentReceiver
	) external;

	function enableModule(address module) external;

	function setGuard(address guard) external;

	function isModuleEnabled(address module) external view returns (bool);
}

/// @notice Safe v1.4.1 `SafeProxyFactory`.
interface ISafeProxyFactory {
	function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce) external returns (address proxy);

	function proxyCreationCode() external pure returns (bytes memory);
}

/// @notice Zodiac Delay 1.0.0 (the calls the treasury setup and recovery use).
interface IDelay {
	function setUp(bytes memory initParams) external;

	function enableModule(address module) external;

	function owner() external view returns (address);

	function avatar() external view returns (address);

	function target() external view returns (address);

	function txCooldown() external view returns (uint256);

	function txExpiration() external view returns (uint256);

	function txNonce() external view returns (uint256);

	function queueNonce() external view returns (uint256);

	function isModuleEnabled(address module) external view returns (bool);

	function execTransactionFromModule(address to, uint256 value, bytes calldata data, Operation operation) external returns (bool);

	function executeNextTx(address to, uint256 value, bytes calldata data, Operation operation) external;

	function setTxNonce(uint256 nonce) external;
}
