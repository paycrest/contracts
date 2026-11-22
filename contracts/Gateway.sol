// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import {GatewaySettingManager} from './GatewaySettingManager.sol';
import {IGateway, IERC20} from './interfaces/IGateway.sol';

/**
 * @title Gateway
 * @notice This contract serves as a gateway for creating orders and managing settlements.
 */
contract Gateway is IGateway, GatewaySettingManager, PausableUpgradeable {
	using SafeERC20 for IERC20;

	/// @dev Deprecated. Retained for storage/ABI stability of this upgradeable contract; do not use in new code.
	struct fee {
		uint256 protocolFee;
		uint256 liquidityProviderAmount;
	}

	/// @notice Most payees an order can be bound to.
	uint256 public constant MAX_PAYEES = 8;

	mapping(bytes32 => Order) private order;
	mapping(address => uint256) private _nonce;
	// keccak256(abi.encode(payees)) of each order's payee list; zero until it is bound. Set once, never changed.
	mapping(bytes32 => bytes32) private _payeesHash;
	// While true, settleOut, refund and setPayees revert. Only the owner clears it.
	bool private _settlementFrozen;
	uint256[48] private __gap;

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
	 * @dev Modifier that allows only the owner or the guardian to call a function.
	 */
	modifier onlyOwnerOrGuardian() {
		require(msg.sender == owner() || (_guardian != address(0) && msg.sender == _guardian), 'OnlyOwnerOrGuardian');
		_;
	}

	/**
	 * @dev Modifier that blocks a function while settlement is frozen.
	 */
	modifier whenSettlementNotFrozen() {
		require(!_settlementFrozen, 'SettlementFrozen');
		_;
	}

	/* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */
	/**
	 * @dev Pause the contract. The owner or the guardian can pause; only the owner can unpause.
	 */
	function pause() external onlyOwnerOrGuardian {
		_pause();
	}

	/**
	 * @dev Unpause the contract.
	 */
	function unpause() external onlyOwner {
		_unpause();
	}

	/** @dev See {freezeSettlement-IGateway}. */
	function freezeSettlement() external onlyOwnerOrGuardian {
		require(!_settlementFrozen, 'SettlementFrozen');
		_settlementFrozen = true;
		emit SettlementFrozen(msg.sender);
	}

	/** @dev See {unfreezeSettlement-IGateway}. */
	function unfreezeSettlement() external onlyOwner {
		require(_settlementFrozen, 'SettlementNotFrozen');
		_settlementFrozen = false;
		emit SettlementUnfrozen(msg.sender);
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
		orderId = _createOrder(_token, _amount, _rate, _senderFeeRecipient, _senderFee, _refundAddress, messageHash);
	}

	/** @dev See {createOrderWithPayees-IGateway}. */
	function createOrderWithPayees(
		address _token,
		uint256 _amount,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash,
		address[] calldata _payees
	) external whenNotPaused returns (bytes32 orderId) {
		orderId = _createOrder(_token, _amount, _rate, _senderFeeRecipient, _senderFee, _refundAddress, messageHash);
		_bindPayees(orderId, _payees);
	}

	function _createOrder(
		address _token,
		uint256 _amount,
		uint96 _rate,
		address _senderFeeRecipient,
		uint256 _senderFee,
		address _refundAddress,
		string calldata messageHash
	) internal returns (bytes32 orderId) {
		// checks that are required
		_handler(_token, _amount, _refundAddress, _senderFeeRecipient, _senderFee);

		// validate messageHash
		require(bytes(messageHash).length != 0, 'InvalidMessageHash');

		// transfer token from msg.sender to contract
		IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount + _senderFee);

		// increase users nonce to avoid replay attacks
		_nonce[msg.sender]++;

		// generate transaction id for the transaction with chain id
		orderId = keccak256(abi.encode(msg.sender, _nonce[msg.sender], block.chainid));

		require(order[orderId].sender == address(0), 'OrderAlreadyExists');

		TokenFeeSettings memory settings = _tokenFeeSettings[_token];
		uint256 _protocolFee;
		if (settings.providerToTreasury > 0) {
			_protocolFee = (_amount * settings.providerToTreasury) / MAX_BPS;
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

	/**
	 * @dev Binds an order's payee list. The caller has checked the order is open and has no list yet.
	 */
	function _bindPayees(bytes32 _orderId, address[] calldata _payees) internal {
		uint256 count = _payees.length;
		require(count != 0 && count <= MAX_PAYEES, 'InvalidPayees');
		for (uint256 i; i < count; ++i) {
			require(_payees[i] != address(0), 'InvalidPayees');
		}
		_payeesHash[_orderId] = keccak256(abi.encode(_payees));
		emit OrderPayeesSet(_orderId, _payees);
	}

	/**
	 * @dev Reverts unless `_payees` is the order's bound list and contains `_liquidityProvider`.
	 */
	function _requirePayee(bytes32 _orderId, address _liquidityProvider, address[] calldata _payees) internal view {
		bytes32 bound = _payeesHash[_orderId];
		require(bound != bytes32(0), 'PayeesNotSet');
		require(keccak256(abi.encode(_payees)) == bound, 'PayeesMismatch');
		uint256 count = _payees.length;
		for (uint256 i; i < count; ++i) {
			if (_payees[i] == _liquidityProvider) return;
		}
		revert('PayeeNotAllowed');
	}

	/* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
	/** @dev See {setPayees-IGateway}. */
	function setPayees(
		bytes32 _orderId,
		address[] calldata _payees
	) external onlyAggregator whenSettlementNotFrozen returns (bool) {
		require(order[_orderId].sender != address(0), 'OrderNotFound');
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');
		require(!order[_orderId].isRefunded, 'OrderRefunded');
		require(_payeesHash[_orderId] == bytes32(0), 'PayeesAlreadySet');
		_bindPayees(_orderId, _payees);
		return true;
	}

	/** @dev See {settleOut-IGateway}. */
	function settleOut(
		bytes32 _splitOrderId,
		bytes32 _orderId,
		address _liquidityProvider,
		uint64 _settlePercent,
		uint64 _rebatePercent,
		address[] calldata _payees
	) external onlyAggregator whenSettlementNotFrozen returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');
		require(!order[_orderId].isRefunded, 'OrderRefunded');
		require(_rebatePercent <= _maxRebatePercent, 'InvalidRebatePercent');
		_requirePayee(_orderId, _liquidityProvider, _payees);

		// load the token into memory
		address token = order[_orderId].token;

		// subtract sum of amount based on the input _settlePercent
		uint256 currentOrderBPS = order[_orderId].currentBPS;
		require(_settlePercent > 0 && _settlePercent <= currentOrderBPS, "InvalidSettlePercent");
		order[_orderId].currentBPS -= _settlePercent;

		if (order[_orderId].currentBPS == 0) {
			// update the transaction to be fulfilled
			order[_orderId].isFulfilled = true;

			if (order[_orderId].senderFee > 0) {
				_handleTransferFeeSplitting(
					_orderId,
					token,
					order[_orderId].senderFeeRecipient,
					order[_orderId].senderFee
				);
			}
		}

		// transfer to liquidity provider
		uint256 liquidityProviderAmount = (order[_orderId].amount * _settlePercent) / currentOrderBPS;
		order[_orderId].amount -= liquidityProviderAmount;

		TokenFeeSettings memory settings = _tokenFeeSettings[order[_orderId].token];
		if (settings.providerToTreasury > 0) {
			uint256 treasuryFee = (liquidityProviderAmount * settings.providerToTreasury) / MAX_BPS;
			liquidityProviderAmount -= treasuryFee;
			if (_rebatePercent > 0) {
				uint256 rebateAmount = (treasuryFee * _rebatePercent) / MAX_BPS;
				treasuryFee -= rebateAmount;
				liquidityProviderAmount += rebateAmount;
			}
			if (treasuryFee > 0) {
				IERC20(token).safeTransfer(treasuryAddress, treasuryFee);
			}
		}

		IERC20(token).safeTransfer(_liquidityProvider, liquidityProviderAmount);

		// emit settled event
		emit SettleOut(
			_splitOrderId,
			_orderId,
			_liquidityProvider,
			_settlePercent,
			_rebatePercent
		);

		return true;
	}

	function _settleInOrderKey(bytes32 _orderId) internal pure returns (bytes32) {
		return keccak256(abi.encode('SETTLE_IN', _orderId));
	}

	/** @dev See {settleIn-IGateway}. */
	function settleIn(
		bytes32 _orderId,
		address _token,
		uint256 _amount,
		address _senderFeeRecipient,
		uint96 _senderFee,
		address _recipient,
		uint96 _rate,
		uint64 _rebatePercent
	) external whenNotPaused returns (bool) {
		bytes32 storageKey = _settleInOrderKey(_orderId);
		require(order[storageKey].sender == address(0) && order[_orderId].sender == address(0), 'OrderAlreadyExists');
		require(_rebatePercent <= MAX_BPS, 'InvalidRebatePercent');
		_handler(_token, _amount, _recipient, _senderFeeRecipient, _senderFee);

		IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount + _senderFee);

		(uint256 grossTreasuryFee, uint256 amountToSettle) = _bookSettleInAndPayFees(
			storageKey,
			_token,
			_amount,
			_senderFeeRecipient,
			_senderFee,
			_recipient,
			_rebatePercent
		);

		if (_senderFee != 0) {
			_handleTransferFeeSplitting(_orderId, _token, _senderFeeRecipient, _senderFee);
		}

		emit SettleIn(
			_orderId,
			msg.sender,
			_recipient,
			amountToSettle,
			_token,
			grossTreasuryFee,
			_rate,
			_rebatePercent
		);

		return true;
	}

	/**
	 * @dev Books order state before fee/recipient transfers (CEI), then pays treasury/rebate/recipient.
	 */
	function _bookSettleInAndPayFees(
		bytes32 _storageKey,
		address _token,
		uint256 _amount,
		address _senderFeeRecipient,
		uint96 _senderFee,
		address _recipient,
		uint64 _rebatePercent
	) internal returns (uint256 grossTreasuryFee, uint256 amountToSettle) {
		uint256 treasuryFee;
		uint256 rebateAmount;
		amountToSettle = _amount;
		TokenFeeSettings memory settings = _tokenFeeSettings[_token];
		if (settings.providerToTreasury > 0) {
			grossTreasuryFee = (_amount * settings.providerToTreasury) / MAX_BPS;
			if (grossTreasuryFee > 0) {
				amountToSettle = _amount - grossTreasuryFee;
			}
		}

		treasuryFee = grossTreasuryFee;
		if (treasuryFee > 0 && _rebatePercent > 0) {
			rebateAmount = (treasuryFee * _rebatePercent) / MAX_BPS;
			treasuryFee -= rebateAmount;
		}

		// Arm OrderAlreadyExists before external transfers.
		order[_storageKey].sender = _recipient;
		order[_storageKey].token = _token;
		order[_storageKey].senderFeeRecipient = _senderFeeRecipient;
		order[_storageKey].senderFee = _senderFee;
		order[_storageKey].protocolFee = grossTreasuryFee;
		order[_storageKey].isFulfilled = true;
		order[_storageKey].amount = amountToSettle;

		if (treasuryFee > 0) {
			IERC20(_token).safeTransfer(treasuryAddress, treasuryFee);
		}
		if (rebateAmount > 0) {
			IERC20(_token).safeTransfer(msg.sender, rebateAmount);
		}
		IERC20(_token).safeTransfer(_recipient, amountToSettle);
	}

	/** @dev See {refund-IGateway}. */
	function refund(uint256 _fee, bytes32 _orderId) external onlyAggregator whenSettlementNotFrozen returns (bool) {
		// ensure the transaction has not been fulfilled
		require(!order[_orderId].isFulfilled, 'OrderFulfilled');
		require(!order[_orderId].isRefunded, 'OrderRefunded');
		require(order[_orderId].protocolFee >= _fee, 'FeeExceedsProtocolFee');

		if (_fee > 0) {
			// transfer refund fee to the treasury
			IERC20(order[_orderId].token).safeTransfer(treasuryAddress, _fee);
		}

		// reset state values
		order[_orderId].isRefunded = true;
		order[_orderId].currentBPS = 0;

		// deduct fee from order amount
		uint256 refundAmount = order[_orderId].amount - _fee;

		// transfer refund amount and sender fee to the refund address
		IERC20(order[_orderId].token).safeTransfer(
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
		if (order[_orderId].sender != address(0)) {
			return order[_orderId];
		}
		return order[_settleInOrderKey(_orderId)];
	}

	/** @dev See {isTokenSupported-IGateway}. */
	function isTokenSupported(address _token) external view returns (bool) {
		if (_isTokenSupported[_token] == 1) return true;
		return false;
	}

	/** @dev See {getAggregator-IGateway}. */
	function getAggregator() external view returns (address) {
		return _aggregatorAddress;
	}

	/** @dev See {getOrderPayeesHash-IGateway}. */
	function getOrderPayeesHash(bytes32 _orderId) external view returns (bytes32) {
		return _payeesHash[_orderId];
	}

	/** @dev See {isSettlementFrozen-IGateway}. */
	function isSettlementFrozen() external view returns (bool) {
		return _settlementFrozen;
	}

	function _handleTransferFeeSplitting(
		bytes32 _orderId,
		address _token,
		address _senderFeeRecipient,
		uint256 _senderFee
	) internal {
		TokenFeeSettings memory settings = _tokenFeeSettings[_token];

		uint256 treasuryAmount = (_senderFee * settings.senderToTreasury) / MAX_BPS;
		uint256 senderAmount = _senderFee - treasuryAmount;

		if (senderAmount > 0) {
			IERC20(_token).safeTransfer(_senderFeeRecipient, senderAmount);
		}

		if (treasuryAmount > 0) {
			IERC20(_token).safeTransfer(treasuryAddress, treasuryAmount);
		}

		emit SenderFeeTransferred(_orderId, _senderFeeRecipient, senderAmount);
		emit TransferFeeSplit(_orderId, senderAmount, treasuryAmount);
	}
}
