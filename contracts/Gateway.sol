// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';

import {GatewaySettingManager} from './GatewaySettingManager.sol';
import {IGateway, IERC20} from './interfaces/IGateway.sol';

/**
 * @title Gateway
 * @notice This contract serves as a gateway for creating orders and managing settlements.
 */
contract Gateway is IGateway, GatewaySettingManager, PausableUpgradeable {
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
	/** @dev See {createOrder-IGateway}. */
	function createOrder(
		address _token,
		uint256 _amount,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash
	) external whenNotPaused returns (bytes32 orderId) {
		// checks that are required
		_handler(_token, _amount, _refundAddress, _senderFeeRecipient, _senderFee);

		// validate messageHash
		require(bytes(messageHash).length != 0, 'InvalidMessageHash');

		// transfer token from msg.sender to contract
		IERC20(_token).transferFrom(msg.sender, address(this), _amount + _senderFee);

		// increase users nonce to avoid replay attacks
		_nonce[msg.sender]++;

		// generate transaction id for the transaction with chain id
		orderId = keccak256(abi.encode(msg.sender, _nonce[msg.sender], block.chainid));

		require(order[orderId].sender == address(0), 'OrderAlreadyExists');

		// update transaction
		uint256 _protocolFee;
		if (_rate == 100) {
			// local transfer (rate = 1)
			_protocolFee = 0;
			require(_senderFee > 0, 'SenderFeeIsZero');
		} else {
			// fx transfer (rate != 1) - use token-specific providerToAggregatorFx
			TokenFeeSettings memory settings = _tokenFeeSettings[_token];
			require(settings.providerToAggregatorFx > 0, 'TokenFeeSettingsNotConfigured');
			_protocolFee = (_amount * settings.providerToAggregatorFx) / MAX_BPS;
		}
		order[orderId] = Order({
			sender: msg.sender,
			token: _token,
			senderFeeRecipient: _senderFeeRecipient,
			senderFee: _senderFee,
			protocolFee: _protocolFee,
			isFulfilled: false,
			isRefunded: false,
			refundAddress: _refundAddress,
			currentBPS: uint64(MAX_BPS),
			amount: _amount
		});

		// emit order created event
		emit OrderCreated(
			_refundAddress,
			_token,
			order[orderId].amount,
			_protocolFee,
			orderId,
			_rate,
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
	 */
	function _handler(
		address _token,
		uint256 _amount,
		address _refundAddress,
		address _senderFeeRecipient,
		uint256 _senderFee
	) internal view {
		require(_isTokenSupported[_token] == 1, 'TokenNotSupported');
		require(_amount != 0, 'AmountIsZero');
		require(_refundAddress != address(0), 'ThrowZeroAddress');

		if (_senderFee != 0) {
			require(_senderFeeRecipient != address(0), 'InvalidSenderFeeRecipient');
		}
	}

	/* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
	/** @dev See {settle-IGateway}. */
	function settle(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent,
		uint64 _rebatePercent
	) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');
		require(!order[_orderId].isRefunded, 'OrderRefunded');
		require(_rebatePercent <= MAX_BPS, 'InvalidRebatePercent');

		// load the token into memory
		address token = order[_orderId].token;

		// subtract sum of amount based on the input _settlePercent
		uint256 currentOrderBPS = order[_orderId].currentBPS;
		order[_orderId].currentBPS -= _settlePercent;

		if (order[_orderId].currentBPS == 0) {
			// update the transaction to be fulfilled
			order[_orderId].isFulfilled = true;

			if (order[_orderId].senderFee != 0 && order[_orderId].protocolFee != 0) {
				// fx transfer - sender keeps all fee
				_handleFxTransferFeeSplitting(_orderId);
			}
		}

		if (order[_orderId].senderFee != 0 && order[_orderId].protocolFee == 0) {
			// local transfer - split sender fee
			_handleLocalTransferFeeSplitting(_orderId, _liquidityProvider, _settlePercent);
		}

		// transfer to liquidity provider
		uint256 liquidityProviderAmount = (order[_orderId].amount * _settlePercent) /
			currentOrderBPS;
		order[_orderId].amount -= liquidityProviderAmount;

		if (order[_orderId].protocolFee != 0) {
			// FX transfer - use token-specific providerToAggregatorFx
			TokenFeeSettings memory settings = _tokenFeeSettings[order[_orderId].token];
			uint256 protocolFee = (liquidityProviderAmount * settings.providerToAggregatorFx) /
				MAX_BPS;
			liquidityProviderAmount -= protocolFee;

			if (_rebatePercent != 0) {
				// calculate rebate amount
				uint256 rebateAmount = (protocolFee * _rebatePercent) / MAX_BPS;
				protocolFee -= rebateAmount;
				liquidityProviderAmount += rebateAmount;
			}

			// transfer protocol fee
			IERC20(token).transfer(treasuryAddress, protocolFee);
		}

		IERC20(token).transfer(_liquidityProvider, liquidityProviderAmount);

		// emit settled event
		emit OrderSettled(
			_splitOrderId,
			_orderId,
			_liquidityProvider,
			_settlePercent,
			_rebatePercent
		);

		return true;
	}

	/** @dev See {refund-IGateway}. */
	function refund(uint256 _fee, bytes32 _orderId) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');
		require(!order[_orderId].isRefunded, 'OrderRefunded');
		require(order[_orderId].protocolFee >= _fee, 'FeeExceedsProtocolFee');

		if (_fee > 0) {
			// transfer refund fee to the treasury
			IERC20(order[_orderId].token).transfer(treasuryAddress, _fee);
		}

		// reset state values
		order[_orderId].isRefunded = true;
		order[_orderId].currentBPS = 0;

		// deduct fee from order amount
		uint256 refundAmount = order[_orderId].amount - _fee;

		// transfer refund amount and sender fee to the refund address
		IERC20(order[_orderId].token).transfer(
			order[_orderId].refundAddress,
			refundAmount + order[_orderId].senderFee
		);

		// emit refunded event
		emit OrderRefunded(_fee, _orderId);

		return true;
	}

	/* ##################################################################
                                VIEW CALLS
    ################################################################## */
	/** @dev See {getOrderInfo-IGateway}. */
	function getOrderInfo(bytes32 _orderId) external view returns (Order memory) {
		return order[_orderId];
	}

	/** @dev See {isTokenSupported-IGateway}. */
	function isTokenSupported(address _token) external view returns (bool) {
		if (_isTokenSupported[_token] == 1) return true;
		return false;
	}

	/**
	 * @dev Handles fee splitting for local transfers (rate = 1).
	 * @param _orderId The order ID to process.
	 * @param _liquidityProvider The address of the liquidity provider who fulfilled the order.
	 */
	function _handleLocalTransferFeeSplitting(
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent
	) internal {
		TokenFeeSettings memory settings = _tokenFeeSettings[order[_orderId].token];
		uint256 senderFee = order[_orderId].senderFee;

		// Calculate splits based on config
		uint256 providerAmount = (senderFee * settings.senderToProvider) / MAX_BPS;
		uint256 currentProviderAmount = (providerAmount * _settlePercent) / MAX_BPS;
		uint256 aggregatorAmount = (currentProviderAmount * settings.providerToAggregator) /
			MAX_BPS;
		uint256 senderAmount = senderFee - providerAmount;

		// Transfer sender portion
		if (senderAmount != 0 && order[_orderId].currentBPS == 0) {
			IERC20(order[_orderId].token).transfer(
				order[_orderId].senderFeeRecipient,
				senderAmount
			);
		}

		// Transfer aggregator portion to treasury
		if (aggregatorAmount != 0) {
			IERC20(order[_orderId].token).transfer(treasuryAddress, aggregatorAmount);
		}

		// Transfer provider portion to the liquidity provider who fulfilled the order
		currentProviderAmount = currentProviderAmount - aggregatorAmount;
		if (currentProviderAmount != 0) {
			IERC20(order[_orderId].token).transfer(_liquidityProvider, currentProviderAmount);
		}

		// Emit events
		emit SenderFeeTransferred(order[_orderId].senderFeeRecipient, senderAmount);
		emit LocalTransferFeeSplit(_orderId, senderAmount, currentProviderAmount, aggregatorAmount);
	}

	/**
	 * @dev Handles fee splitting for FX transfers (rate != 1).
	 * @param _orderId The order ID to process.
	 */
	function _handleFxTransferFeeSplitting(bytes32 _orderId) internal {
		TokenFeeSettings memory settings = _tokenFeeSettings[order[_orderId].token];
		uint256 senderFee = order[_orderId].senderFee;

		// Calculate sender portion based on senderToAggregator setting
		uint256 senderAmount = (senderFee * (MAX_BPS - settings.senderToAggregator)) / MAX_BPS;
		uint256 aggregatorAmount = senderFee - senderAmount;

		// Transfer sender portion
		if (senderAmount > 0) {
			IERC20(order[_orderId].token).transfer(
				order[_orderId].senderFeeRecipient,
				senderAmount
			);
		}

		// Transfer aggregator portion to treasury
		if (aggregatorAmount > 0) {
			IERC20(order[_orderId].token).transfer(treasuryAddress, aggregatorAmount);
		}

		// Emit events
		emit SenderFeeTransferred(order[_orderId].senderFeeRecipient, senderAmount);
		emit FxTransferFeeSplit(_orderId, senderAmount, aggregatorAmount);
	}
}
