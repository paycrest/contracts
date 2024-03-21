// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import {PaycrestSettingManager} from './PaycrestSettingManager.sol';
import {IPaycrest, IERC20} from './interfaces/IPaycrest.sol';
import {SharedStructs} from './libraries/SharedStructs.sol';

/**
 * @title Paycrest
 * @dev Paycrest contract for handling orders and settlements.
 */
contract Paycrest is IPaycrest, PaycrestSettingManager, PausableUpgradeable {
	struct fee {
		uint256 protocolFee;
		uint256 liquidityProviderAmount;
	}

	mapping(bytes32 => Order) private order;
	mapping(address => uint256) private _nonce;
	uint256[50] private __gap;

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/**
	 * @dev Initialize function.
	 */
	function initialize() external initializer {
		MAX_BPS = 100_000;
		__Ownable2Step_init();
		__Pausable_init();
	}

	/**
	 * @dev Modifier that allows only the aggregator to call a function.
	 */
	modifier onlyAggregator() {
		require(msg.sender == _aggregatorAddress, 'OnlyAggregator');
		_;
	}

	/* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */
	/**
	 * @dev Pause the contract.
	 */
	function pause() external onlyOwner {
		_pause();
	}

	/**
	 * @dev Unpause the contract.
	 */
	function unpause() external onlyOwner {
		_unpause();
	}

	/* ##################################################################
                                USER CALLS
    ################################################################## */
	/** @dev See {createOrder-IPaycrest}. */
	function createOrder(
		address _token,
		uint256 _amount,
		bytes32 _institutionCode,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash
	) external whenNotPaused returns (bytes32 orderId) {
		// checks that are required
		_handler(
			_token,
			_amount,
			_refundAddress,
			_senderFeeRecipient,
			_senderFee,
			_institutionCode
		);

		// validate messageHash
		require(bytes(messageHash).length != 0, 'InvalidMessageHash');

		// transfer token from msg.sender to contract
		IERC20(_token).transferFrom(msg.sender, address(this), _amount + _senderFee);

		// increase users nonce to avoid replay attacks
		_nonce[msg.sender]++;

		// generate transaction id for the transaction
		orderId = keccak256(abi.encode(msg.sender, _nonce[msg.sender]));

		// update transaction
		uint256 _protocolFee = (_amount * protocolFeePercent) / MAX_BPS;
		order[orderId] = Order({
			sender: msg.sender,
			token: _token,
			senderFeeRecipient: _senderFeeRecipient,
			senderFee: _senderFee,
			protocolFee: _protocolFee,
			isFulfilled: false,
			refundAddress: _refundAddress,
			currentBPS: uint64(MAX_BPS),
			amount: _amount - _protocolFee
		});

		// emit order created event
		emit OrderCreated(
			order[orderId].sender,
			_token,
			order[orderId].amount,
			_protocolFee,
			orderId,
			_rate,
			_institutionCode,
			messageHash
		);
	}

	/**
	 * @dev Internal function to handle order creation.
	 * @param _token The address of the token being traded.
	 * @param _amount The amount of tokens being traded.
	 * @param _refundAddress The address to refund the tokens in case of cancellation.
	 * @param _senderFeeRecipient The address of the recipient for the sender fee.
	 * @param _senderFee The amount of the sender fee.
	 * @param _institutionCode The code of the institution associated with the order.
	 */
	function _handler(
		address _token,
		uint256 _amount,
		address _refundAddress,
		address _senderFeeRecipient,
		uint256 _senderFee,
		bytes32 _institutionCode
	) internal view {
		require(_isTokenSupported[_token] == 1, 'TokenNotSupported');
		require(_amount != 0, 'AmountIsZero');
		require(_refundAddress != address(0), 'ThrowZeroAddress');
		require(
			supportedInstitutionsByCode[_institutionCode].name != bytes32(0),
			'InvalidInstitutionCode'
		);

		if (_senderFee != 0) {
			require(_senderFeeRecipient != address(0), 'InvalidSenderFeeRecipient');
		}
	}

	/* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
	/** @dev See {settle-IPaycrest}. */
	function settle(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent
	) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');

		// load the token into memory
		address token = order[_orderId].token;

		// subtract sum of amount based on the input _settlePercent
		order[_orderId].currentBPS -= _settlePercent;

		if (order[_orderId].currentBPS == 0) {
			// update the transaction to be fulfilled
			order[_orderId].isFulfilled = true;

			if (order[_orderId].senderFee != 0) {
				// transfer sender fee
				_transferSenderFee(_orderId);
			}

			if (order[_orderId].protocolFee != 0) {
				// transfer protocol fee
				IERC20(token).transfer(treasuryAddress, order[_orderId].protocolFee);
			}
		}

		// transfer to liquidity provider
		uint256 liquidityProviderAmount = (order[_orderId].amount * _settlePercent) / MAX_BPS;
		IERC20(token).transfer(_liquidityProvider, liquidityProviderAmount);
		order[_orderId].amount -= liquidityProviderAmount;

		// emit settled event
		emit OrderSettled(_splitOrderId, _orderId, _liquidityProvider, _settlePercent);

		return true;
	}

	/**
	 * @dev Internal function to transfer the sender fee.
	 * @param _orderId The ID of the order.
	 */
	function _transferSenderFee(bytes32 _orderId) internal {
		address recipient = order[_orderId].senderFeeRecipient;
		uint256 _fee = order[_orderId].senderFee;

		// transfer sender fee
		IERC20(order[_orderId].token).transfer(recipient, _fee);

		// emit event
		emit SenderFeeTransferred(recipient, _fee);
	}

	/** @dev See {refund-IPaycrest}. */
	function refund(uint256 _fee, bytes32 _orderId) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');

		// transfer refund fee to the treasury
		IERC20(order[_orderId].token).transfer(treasuryAddress, _fee);

		// reset state values
		order[_orderId].isFulfilled = true;
		order[_orderId].currentBPS = 0;

		// deduct fee from order amount
		uint256 refundAmount = order[_orderId].amount + order[_orderId].protocolFee - _fee;

		// transfer refund amount and sender fee to the refund address
		IERC20(order[_orderId].token).transfer(order[_orderId].refundAddress, refundAmount);
		IERC20(order[_orderId].token).transfer(
			order[_orderId].refundAddress,
			order[_orderId].senderFee
		);

		// emit refunded event
		emit OrderRefunded(_fee, _orderId);

		return true;
	}

	/* ##################################################################
                                VIEW CALLS
    ################################################################## */
	/** @dev See {getOrderInfo-IPaycrest}. */
	function getOrderInfo(bytes32 _orderId) external view returns (Order memory) {
		return order[_orderId];
	}

	/** @dev See {isTokenSupported-IPaycrest}. */
	function isTokenSupported(address _token) external view returns (bool) {
		if (_isTokenSupported[_token] == 1) return true;
		return false;
	}

	/** @dev See {getSupportedInstitutionByCode-IPaycrest}. */
	function getSupportedInstitutionByCode(
		bytes32 _code
	) external view returns (SharedStructs.InstitutionByCode memory) {
		return supportedInstitutionsByCode[_code];
	}

	/** @dev See {getSupportedInstitutions-IPaycrest}. */
	function getSupportedInstitutions(
		bytes32 _currency
	) external view returns (SharedStructs.Institution[] memory) {
		return supportedInstitutions[_currency];
	}

	/** @dev See {getFeeDetails-IPaycrest}. */
	function getFeeDetails() external view returns (uint64, uint256) {
		return (protocolFeePercent, MAX_BPS);
	}

	/** @dev See {getAggregator-IPaycrest}. */
	function getAggregator() external view returns (bytes memory) {
		return _aggregator;
	}
}
