// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

import {GatewaySettingManager} from './GatewaySettingManager.sol';
import {IGateway, IERC20} from './interfaces/IGateway.sol';

/**
 * @title Gateway
 * @notice This contract serves as a gateway for creating orders and managing settlements.
 */
contract Gateway is IGateway, GatewaySettingManager, PausableUpgradeable {
	using ECDSA for bytes32;
	struct fee {
		uint256 protocolFee;
		uint256 liquidityProviderAmount;
	}

	mapping(bytes32 => OrderOut) private orderOut;
	mapping(bytes32 => OrderIn) private orderIn;
	mapping(address => uint256) private _nonce;
	mapping(address => mapping(address => uint256)) private balance;
	mapping(bytes32 => bool) private processedOrders;
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

	/**
	 * @dev Modifier that checks if the token is supported.
	 * @param _token The address of the token to be checked.
	 */
	modifier isTokenApproved(address _token) {
		require(_isTokenSupported[_token] == 1, 'TokenNotSupported');
		_;
	}

	/**
	 * @dev Modifier that checks if the deposit amount is valid.
	 * @param _amount The amount to be checked.
	 */
	modifier isValidAmount(uint256 _amount) {
		require(_amount > 0, 'AmountIsZero');
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
		require(bytes(messageHash).length > 0, 'InvalidMessageHash');

		// transfer token from msg.sender to contract
		IERC20(_token).transferFrom(msg.sender, address(this), _amount + _senderFee);

		// increase users nonce to avoid replay attacks
		_nonce[msg.sender]++;

		// generate transaction id for the transaction
		orderId = keccak256(abi.encode(msg.sender, _nonce[msg.sender]));

		// update transaction
		uint256 _protocolFee = (_amount * protocolFeePercent) / MAX_BPS;
		orderOut[orderId] = OrderOut({
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
			orderOut[orderId].amount,
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
	) internal isTokenApproved(_token) isValidAmount(_amount) view {
		require(_refundAddress != address(0), 'ThrowZeroAddress');

		if (_senderFee > 0) {
			require(_senderFeeRecipient != address(0), 'InvalidSenderFeeRecipient');
		}
	}

	/* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
	/** @dev See {settleOrderOut-IGateway}. */
	function settleOrderOut(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _provider,
		uint64 _settlePercent
	) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!orderOut[_orderId].isFulfilled, 'OrderFulfilled');
		require(!orderOut[_orderId].isRefunded, 'OrderRefunded');

		// load the token into memory
		address token = orderOut[_orderId].token;

		// subtract sum of amount based on the input _settlePercent
		orderOut[_orderId].currentBPS -= _settlePercent;

		if (orderOut[_orderId].currentBPS == 0) {
			// update the transaction to be fulfilled
			orderOut[_orderId].isFulfilled = true;

			if (orderOut[_orderId].senderFee > 0) {
				// transfer sender fee
				IERC20(orderOut[_orderId].token).transfer(
					orderOut[_orderId].senderFeeRecipient,
					orderOut[_orderId].senderFee
				);

				// emit event
				emit SenderFeeTransferred(
					orderOut[_orderId].senderFeeRecipient,
					orderOut[_orderId].senderFee
				);
			}

		}

		// transfer to liquidity provider
		uint256 liquidityProviderAmount = (orderOut[_orderId].amount * _settlePercent) / MAX_BPS;
		orderOut[_orderId].amount -= liquidityProviderAmount;

		uint256 protocolFee = (liquidityProviderAmount * protocolFeePercent) / MAX_BPS;
		liquidityProviderAmount -= protocolFee;

		// transfer protocol fee
		IERC20(token).transfer(treasuryAddress, protocolFee);

		IERC20(token).transfer(_provider, liquidityProviderAmount);

		// emit settled event
		emit OrderSettledOut(_splitOrderId, _orderId, _provider, _settlePercent);

		return true;
	}

	/** @dev See {refundOrder-IGateway}. */
	function refundOrder(uint256 _fee, bytes32 _orderId) external onlyAggregator returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!orderOut[_orderId].isFulfilled, 'OrderFulfilled');
		require(!orderOut[_orderId].isRefunded, 'OrderRefunded');
		require(orderOut[_orderId].protocolFee >= _fee, 'FeeExceedsProtocolFee');

		if (_fee > 0) {
			// transfer refund fee to the treasury
			IERC20(orderOut[_orderId].token).transfer(treasuryAddress, _fee);
		}

		// reset state values
		orderOut[_orderId].isRefunded = true;
		orderOut[_orderId].currentBPS = 0;

		// deduct fee from order amount
		uint256 refundAmount = orderOut[_orderId].amount - _fee;

		// transfer refund amount and sender fee to the refund address
		IERC20(orderOut[_orderId].token).transfer(
			orderOut[_orderId].refundAddress,
			refundAmount + orderOut[_orderId].senderFee
		);

		// emit refunded event
		emit OrderRefunded(_fee, _orderId);

		return true;
	}

	/** @dev See {deposit-IGateway}. */
	function deposit(address _token, uint256 _amount) external isTokenApproved(_token) isValidAmount(_amount) returns (bool) {
		address sender = _msgSender();
		IERC20(_token).transferFrom(sender, address(this), _amount);
		balance[_token][sender] += _amount;
		emit Deposit(sender, _token, _amount);
		return true;
	}

	/** @dev See {settledOrderIn-IGateway}. */
    function settleOrderIn(
        bytes32 _orderId,
        bytes memory _signature,
        address _provider,
        address _sender,
        address _token,
        uint256 _amount
    ) external onlyAggregator isValidAmount(_amount) {
        require(!processedOrders[_orderId], "Order already processed");
		require(_provider != address(0), "Invalid provider address");
		require(_sender != address(0), "Invalid sender address");

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(_orderId, _provider, _sender, _token, _amount));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recoveredAddress = ethSignedMessageHash.recover(_signature);
        require(recoveredAddress == _provider, "Invalid signature");
		uint256 _protocolFee = (_amount * protocolFeePercent) / MAX_BPS;
		// Note: There is no need for checks for token supported as the balance will be 0 if the token is not supported
        require(balance[_token][_provider] >= _amount + _protocolFee, "Insufficient balance");

        // Mark order as processed
        processedOrders[_orderId] = true;

        // Update balances
        balance[_token][_provider] -= (_amount + _protocolFee);

		orderIn[_orderId] = OrderIn({
			amount: _amount,
			provider: _provider,
			sender: _sender,
			token: _token,
			orderId: _orderId
		});


		// transfer to sender
		IERC20(_token).transfer(_sender, _amount);
		if (_protocolFee > 0) {
			IERC20(_token).transfer(treasuryAddress, _protocolFee);
		}

        emit OrderSettledIn(_provider, _sender, _amount, _token, _orderId);
    }
	/** @dev See {withdraw-IGateway} */
	function withdrawFrom(address provider, address recipient, uint256 _amount, address _token, bytes memory _signature) external isValidAmount(_amount) onlyAggregator returns (bool) {
		bytes32 messageHash = keccak256(abi.encodePacked(provider, recipient, _amount, _token));
		bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
		address signer = ethSignedMessageHash.recover(_signature);
		require(signer == provider, 'InvalidSignature');

		require(balance[_token][provider] >= _amount, 'InsufficientBalance');
		balance[_token][provider] -= _amount;
		IERC20(_token).transfer(recipient, _amount);
		emit Withdrawn(provider, recipient, _amount, _token);
		return true;
	}

	/* ##################################################################
                                VIEW CALLS
    ################################################################## */
	/** @dev See {getOrderInfoOut-IGateway}. */
	function getOrderInfoOut(bytes32 _orderId) external view returns (OrderOut memory) {
		return orderOut[_orderId];
	}

	/** @dev See {getOrderInfoIn-IGateway}. */
	function getOrderInfoIn(bytes32 _orderId) external view returns (OrderIn memory) {
		return orderIn[_orderId];
	}

	/** @dev See {isTokenSupported-IGateway}. */
	function isTokenSupported(address _token) external view returns (bool) {
		if (_isTokenSupported[_token] == 1) return true;
		return false;
	}

	/** @dev See {getFeeDetails-IGateway}. */
	function getFeeDetails() external view returns (uint64, uint256) {
		return (protocolFeePercent, MAX_BPS);
	}

	/** @dev See {getBalance-IGateway}. */
	function getBalance(address _token, address _provider) external view returns (uint256) {
		return balance[_token][_provider];
	}

	/** See {isOrderProcessed-IGateway} */
	function isOrderProcessed(bytes32 _orderId) external view returns (bool) {
		return processedOrders[_orderId];
	}
}
