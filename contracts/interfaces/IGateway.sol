// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title IGateway
 * @notice Interface for the Gateway contract.
 */
interface IGateway {
	/* ##################################################################
                                EVENTS
    ################################################################## */
	/**
	 * @dev Emitted when a deposit is made.
	 * @param sender The address of the sender.
	 * @param token The address of the deposited token.
	 * @param amount The amount of the deposit.
	 * @param orderId The ID of the order.
	 * @param rate The rate at which the deposit is made.
	 * @param messageHash The hash of the message.
	 */
	event OrderCreated(
		address indexed sender,
		address indexed token,
		uint256 indexed amount,
		uint256 protocolFee,
		bytes32 orderId,
		uint256 rate,
		string messageHash
	);

	/**
	 * @dev Emitted when an aggregator settles a transaction.
	 * @param splitOrderId The ID of the split order.
	 * @param orderId The ID of the order.
	 * @param liquidityProvider The address of the liquidity provider.
	 * @param settlePercent The percentage at which the transaction is settled.
	 */
	event OrderSettled(
		bytes32 splitOrderId,
		bytes32 indexed orderId,
		address indexed liquidityProvider,
		uint96 settlePercent
	);

	/**
	 * @dev Emitted when an aggregator refunds a transaction.
	 * @param fee The fee deducted from the refund amount.
	 * @param orderId The ID of the order.
	 */
	event OrderRefunded(uint256 fee, bytes32 indexed orderId);

	/**
	 * @dev Emitted when the sender's fee is transferred.
	 * @param sender The address of the sender.
	 * @param amount The amount of the fee transferred.
	 */
	event SenderFeeTransferred(address indexed sender, uint256 indexed amount);

	/* ##################################################################
                                STRUCTS
    ################################################################## */
	/**
	 * @dev Struct representing an order.
	 * @param sender The address of the sender.
	 * @param token The address of the token.
	 * @param senderFeeRecipient The address of the sender fee recipient.
	 * @param senderFee The fee to be paid to the sender fee recipient.
	 * @param protocolFee The protocol fee to be paid.
	 * @param isFulfilled Whether the order is fulfilled.
	 * @param isRefunded Whether the order is refunded.
	 * @param refundAddress The address to which the refund is made.
	 * @param currentBPS The current basis points.
	 * @param amount The amount of the order.
	 */
	struct Order {
		address sender;
		address token;
		address senderFeeRecipient;
		uint256 senderFee;
		uint256 protocolFee;
		bool isFulfilled;
		bool isRefunded;
		address refundAddress;
		uint96 currentBPS;
		uint256 amount;
	}

	/* ##################################################################
                                EXTERNAL CALLS
    ################################################################## */
	/**
	 * @notice Locks the sender's amount of token into Gateway.
	 * @dev Requirements:
	 * - `msg.sender` must approve Gateway contract on `_token` of at least `amount` before function call.
	 * - `_token` must be an acceptable token. See {isTokenSupported}.
	 * - `amount` must be greater than minimum.
	 * - `_refundAddress` refund address must not be zero address.
	 * @param _token The address of the token.
	 * @param _amount The amount in the decimal of `_token` to be locked.
	 * @param _rate The rate at which the sender intends to sell `_amount` of `_token`.
	 * @param _senderFeeRecipient The address that will receive `_senderFee` in `_token`.
	 * @param _senderFee The amount in the decimal of `_token` that will be paid to `_senderFeeRecipient`.
	 * @param _refundAddress The address that will receive `_amount` in `_token` when there is a need to refund.
	 * @param messageHash The hash of the message.
	 * @return _orderId The ID of the order.
	 */
	function createOrder(
		address _token,
		uint256 _amount,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash
	) external returns (bytes32 _orderId);

	/**
	 * @notice Settles a transaction and distributes rewards accordingly.
	 * @param _splitOrderId The ID of the split order.
	 * @param _orderId The ID of the transaction.
	 * @param _liquidityProvider The address of the liquidity provider.
	 * @param _settlePercent The rate at which the transaction is settled.
	 * @return bool the settlement is successful.
	 */
	function settle(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent
	) external returns (bool);

	/**
	 * @notice Refunds to the specified refundable address.
	 * @dev Requirements:
	 * - Only aggregators can call this function.
	 * @param _fee The amount to be deducted from the amount to be refunded.
	 * @param _orderId The ID of the transaction.
	 * @return bool the refund is successful.
	 */
	function refund(uint256 _fee, bytes32 _orderId) external returns (bool);

	/**
	 * @notice Checks if a token is supported by Gateway.
	 * @param _token The address of the token to check.
	 * @return bool the token is supported.
	 */
	function isTokenSupported(address _token) external view returns (bool);

	/**
	 * @notice Gets the details of an order.
	 * @param _orderId The ID of the order.
	 * @return Order The order details.
	 */
	function getOrderInfo(bytes32 _orderId) external view returns (Order memory);

	/**
	 * @notice Gets the fee details of Gateway.
	 * @return protocolReward The protocol reward amount.
	 * @return max_bps The maximum basis points.
	 */
	function getFeeDetails() external view returns (uint64 protocolReward, uint256 max_bps);
}
