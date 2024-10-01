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
	 * @notice Emitted when an order is created.
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
	 * @notice Emitted when an order is settled out.
	 * @param splitOrderId The ID of the split order.
	 * @param orderId The ID of the order.
	 * @param liquidityProvider The address of the liquidity provider.
	 * @param settlePercent The percentage at which the transaction is settled.
	 */
	event OrderSettledOut(
		bytes32 splitOrderId,
		bytes32 indexed orderId,
		address indexed liquidityProvider,
		uint96 settlePercent
	);

	/**
	 * @notice Emitted when an aggregator refunds a transaction.
	 * @param fee The fee deducted from the refund amount.
	 * @param orderId The ID of the order.
	 */
	event OrderRefunded(uint256 fee, bytes32 indexed orderId);

	/**
	 * @notice Emitted when the sender's fee is transferred.
	 * @param sender The address of the sender.
	 * @param amount The amount of the fee transferred.
	 */
	event SenderFeeTransferred(address indexed sender, uint256 indexed amount);

	/**
	 * @notice Emitted when a deposit is made by a provider.
	 * @param sender The address of the sender.
	 * @param token The address of the deposited token.
	 * @param amount The amount of the deposit.
	 */
	event Deposit(address indexed sender, address indexed token, uint256 indexed amount);

	/**
	 * @dev Emitted when an order is settled in.
	 * @param provider The address of the provider.
	 * @param senderAddress The address of the sender.
	 * @param amount The address of the deposited token.
	 * @param token The amount of the deposit.
	 * @param orderId The ID of the order.
	 */
	event OrderSettledIn(address indexed provider, address indexed senderAddress, uint256 indexed amount, address token, bytes32 orderId);
	/* ##################################################################
                                STRUCTS
    ################################################################## */
	/**
	 * @notice Struct representing an order out.
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
	struct OrderOut {
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

	/**
	 * @notice Struct representing an order settled in.
	 * @param amount  The amount of the order.
	 * @param provider  The address of the provider.
	 * @param sender  The address of the sender. 
	 * @param token The address of the token. 
	 * @param orderid The ID of the order.
	 */
	struct OrderIn {
		uint256 amount;
		address provider;
		address sender;
		address token;
		bytes32 orderId;
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
	 * @notice Settles an order out transaction and distributes fees accordingly.
	 * @param _splitOrderId The ID of the split order.
	 * @param _orderId The ID of the transaction.
	 * @param _provider The address of the liquidity provider.
	 * @param _settlePercent The rate at which the transaction is settled.
	 * @return bool The settlement is successful.
	 */
	function settleOrderOut(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _provider,
		uint64 _settlePercent
	) external returns (bool);

	/**
	 * @notice Refunds to the specified refund address.
	 * @dev Requirements:
	 * - Only aggregators can call this function.
	 * @param _fee The amount to be deducted from the amount to be refunded.
	 * @param _orderId The ID of the transaction.
	 * @return bool the refund is successful.
	 */
	function refundOrder(uint256 _fee, bytes32 _orderId) external returns (bool);

	/**
	 * @notice Allow a provider to deposit an asset into Gateway.
	 * @dev Requirements:
	 * - The amount must be greater than minimum.
	 * - The asset must be supported.
	 * - The provider must approve Gateway contract on `_token` of at least `_amount` before function call
	 * @param _token The address of the asset.
	 * @param _amount The amount to be deposited.
	 * @return bool The deposit is successful.
	 */
	function deposit(address _token, uint256 _amount) external returns (bool);

	
	/**
	 * @notice Allow aggregator to settle an order coming in.
	 * @param _orderId The ID of the transaction.
	 * @param _signature The signature of the provider.
	 * @param _provider The address of the provider.
	 * @param _senderAddress The address of the sender.
	 * @param _token The address of the asset.
	 * @param _amount The amount to be transferred.
	 */
	function settleOrderIn(
        bytes32 _orderId,
        bytes memory _signature,
        address _provider,
        address _senderAddress,
        address _token,
        uint256 _amount
    ) external;

	/**
	 * @notice Checks if a token is supported by Gateway.
	 * @param _token The address of the token to check.
	 * @return bool the token is supported.
	 */
	function isTokenSupported(address _token) external view returns (bool);

	/**
	 * @notice Gets the details of an off ramp order.
	 * @param _orderId The ID of the order.
	 * @return Order The order details.
	 */
	function getOrderInfoOut(bytes32 _orderId) external view returns (OrderOut memory);

	/**
	 * @notice Gets the details of an on ramp order.
	 * @param _orderId The ID of the order.
	 * @return Order The order details.
	 */
	function getOrderInfoIn(bytes32 _orderId) external view returns (OrderIn memory);

	/**
	 * @notice Gets the fee details of Gateway.
	 * @return protocolReward The protocol reward amount.
	 * @return max_bps The maximum basis points.
	 */
	function getFeeDetails() external view returns (uint64 protocolReward, uint256 max_bps);

	/**
	 * @notice Gets the balance of a provider.
	 * @param _provider The address of the provider.
	 * @param _asset The address of the asset.
	 * @return uint256 The provider's balance.
	 */
	function getBalance(address _asset, address _provider) external view returns (uint256);

	/**
	 * @notice Gets order processed status.
	 * @param _orderId The ID of the order.
	 * @return bool The order processed status.
	 */
	function isOrderProcessed(bytes32 _orderId) external view returns (bool);
}
