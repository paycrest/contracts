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
	 * @dev Emitted when an order is created.
	 * @param sender The address of the sender.
	 * @param token The address of the order token.
	 * @param amount The order amount.
	 * @param orderId The ID of the order.
	 * @param rate The rate used for the order.
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
	 * @param rebatePercent The percentage of the aggregator fee that is given back to the provider.
	 */
	event SettleOut(
		bytes32 splitOrderId,
		bytes32 indexed orderId,
		address indexed liquidityProvider,
		uint64 settlePercent,
		uint64 rebatePercent
	);

	/**
	 * @dev Emitted when an onramp order is successfully processed.
	 */
	event SettleIn(
		bytes32 indexed orderId,
		address indexed liquidityProvider,
		address indexed recipient,
		uint256 amount,
		address token,
		uint256 aggregatorFee,
		uint96 rate,
		uint64 rebatePercent
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
	event SenderFeeTransferred(bytes32 indexed orderId, address indexed sender, uint256 indexed amount);

	/**
	 * @dev Emitted when sender fee is split between recipient and treasury.
	 * @param orderId The ID of the order.
	 * @param senderAmount The amount that goes to the sender fee recipient.
	 * @param aggregatorAmount The amount that goes to the treasury.
	 */
	event TransferFeeSplit(
		bytes32 indexed orderId,
		uint256 senderAmount,
		uint256 aggregatorAmount
	);

	/**
	 * @dev Emitted when an order's payee list is bound, at creation or by the aggregator.
	 * @param orderId The ID of the order.
	 * @param payees The addresses `settleOut` may pay for this order.
	 */
	event OrderPayeesSet(bytes32 indexed orderId, address[] payees);

	/**
	 * @dev Emitted when settlement is frozen.
	 * @param by The owner or guardian that froze it.
	 */
	event SettlementFrozen(address indexed by);

	/**
	 * @dev Emitted when the owner unfreezes settlement.
	 * @param by The owner.
	 */
	event SettlementUnfrozen(address indexed by);

	/**
	 * @dev Emitted when the owner turns the plain `createOrder` requirement on or off.
	 * @param required Whether every new order must bind its payees at creation.
	 */
	event PayeesRequiredUpdated(bool required);

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
	 * - The owner has not turned plain order creation off. See {isPayeesRequired}.
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
	 * @notice Locks the sender's amount of token into Gateway and binds the addresses the order may settle to.
	 * @dev Same requirements as {createOrder}, plus: `_payees` holds 1 to MAX_PAYEES addresses, none of them zero.
	 * The list is fixed for the life of the order; `settleOut` pays only an address in it.
	 * @param _payees The provider payout addresses the order may be settled to.
	 * @return _orderId The ID of the order.
	 */
	function createOrderWithPayees(
		address _token,
		uint256 _amount,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash,
		address[] calldata _payees
	) external returns (bytes32 _orderId);

	/**
	 * @notice Binds the payee list of an order created without one.
	 * @dev Requirements:
	 * - Only the payee binder can call this function, and not while settlement is frozen.
	 * - The order exists, is open and has no payee list yet.
	 * - `_payees` holds 1 to MAX_PAYEES addresses, none of them zero.
	 * @param _orderId The ID of the order.
	 * @param _payees The provider payout addresses the order may be settled to.
	 * @return bool the list was bound.
	 */
	function setPayees(bytes32 _orderId, address[] calldata _payees) external returns (bool);

	/**
	 * @notice Settles a transaction and distributes rewards accordingly.
	 * @dev Requirements:
	 * - Only the aggregator can call this function, and not while settlement is frozen.
	 * - The order's payee list is bound, `_payees` is that list, and `_liquidityProvider` is in it.
	 * - `_rebatePercent` is at most the owner-set maximum.
	 * @param _splitOrderId The ID of the split order.
	 * @param _orderId The ID of the transaction.
	 * @param _liquidityProvider The address of the liquidity provider.
	 * @param _settlePercent The rate at which the transaction is settled.
	 * @param _rebatePercent The percentage of the aggregator fee that is given back to the provider.
	 * @param _payees The order's bound payee list, exactly as bound.
	 * @return bool the settlement is successful.
	 */
	function settleOut(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent,
		uint64 _rebatePercent,
		address[] calldata _payees
	) external returns (bool);

	/**
	 * @notice Processes a settleIn order.
	 * @dev Intended for order in-flows where the caller provides tokens via transferFrom; not restricted to onlyAggregator.
	 * @dev It processes an order and transfers tokens to the recipient after deducting sender fees.
	 * @param _orderId Unique identifier for the order being processed.
	 * @param _token Address of the token to be sent to the user.
	 * @param _amount Total amount transferred in (includes sender fee and protocol fee); recipient receives _amount minus applicable fees.
	 * @param _senderFeeRecipient Address that will receive the sender fee.
	 * @param _senderFee Amount of fee to be paid to the sender fee recipient.
	 * @param _recipient Address of the recipient who will receive the tokens.
	 * @param _rate Quote rate metadata (informational; does not select fee behavior).
	 * @param _rebatePercent The percentage of the aggregator fee that is given back to the caller (LP).
	 * @return success Boolean indicating if the operation was successful.
	 */
	function settleIn(
		bytes32 _orderId,
		address _token,
		uint256 _amount,
		address _senderFeeRecipient,
		uint96 _senderFee,
		address _recipient,
		uint96 _rate,
		uint64 _rebatePercent
	) external returns (bool);

	/**
	 * @notice Refunds to the specified refundable address.
	 * @dev Requirements:
	 * - Only aggregators can call this function, and not while settlement is frozen.
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
	 * @notice Gets the address of the aggregator.
	 * @return address The address of the aggregator.
	 */
	function getAggregator() external view returns (address);

	/**
	 * @notice Freezes settlement: `settleOut`, `refund` and `setPayees` revert until the owner unfreezes.
	 * @dev Only the owner or the guardian can call this function.
	 */
	function freezeSettlement() external;

	/**
	 * @notice Unfreezes settlement.
	 * @dev Only the owner can call this function.
	 */
	function unfreezeSettlement() external;

	/**
	 * @notice Replaces an open order's payee list, or binds one, while settlement is frozen.
	 * @dev Only the owner can call this function, and only while settlement is frozen: it repairs lists bound
	 * wrongly (for example by a compromised payee binder) before settlement resumes.
	 * - The order exists and is open; `_payees` holds 1 to MAX_PAYEES addresses, none of them zero.
	 * @param _orderId The ID of the order.
	 * @param _payees The provider payout addresses the order may be settled to.
	 * @return bool the list was bound.
	 */
	function rebindPayees(bytes32 _orderId, address[] calldata _payees) external returns (bool);

	/**
	 * @notice Turns the plain `createOrder` requirement on or off.
	 * @dev Only the owner can call this function. While on, `createOrder` reverts and new orders must use
	 * `createOrderWithPayees`.
	 * @param _required Whether every new order must bind its payees at creation.
	 */
	function setPayeesRequired(bool _required) external;

	/**
	 * @notice Whether plain `createOrder` is turned off.
	 */
	function isPayeesRequired() external view returns (bool);

	/**
	 * @notice Gets the hash of an order's bound payee list, `keccak256(abi.encode(payees))`.
	 * @param _orderId The ID of the order.
	 * @return bytes32 The hash, or zero when no list is bound.
	 */
	function getOrderPayeesHash(bytes32 _orderId) external view returns (bytes32);

	/**
	 * @notice Whether settlement is frozen.
	 */
	function isSettlementFrozen() external view returns (bool);
}
