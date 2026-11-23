// SPDX-License-Identifier: UNLICENSED

/**
 * @title GatewaySettingManager
 * @dev This contract manages the settings and configurations for the Gateway protocol.
 */
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';

contract GatewaySettingManager is Ownable2StepUpgradeable {
	uint256 internal MAX_BPS;
	uint64 internal protocolFeePercent; // DEPRECATED — kept for proxy storage compatibility (do not remove)
	address internal treasuryAddress;
	address internal _aggregatorAddress;
	mapping(address => uint256) internal _isTokenSupported;

	// Token-specific fee settings
	struct TokenFeeSettings {
		uint256 senderToProvider; // DEPRECATED
		uint256 providerToAggregator; // DEPRECATED 
		uint256 senderToTreasury; // BPS of sender fee paid to treasury
		uint256 providerToTreasury; // BPS of order principal paid to treasury
	}

	mapping(address => TokenFeeSettings) internal _tokenFeeSettings;

	// Can pause the Gateway and freeze settlement; cannot unpause, unfreeze or change settings.
	address internal _guardian;
	// Highest rebate `settleOut` accepts, in BPS of the treasury fee. Packed with `_guardian`.
	uint64 internal _maxRebatePercent;
	// The only key that can bind an order's payee list with `setPayees`. Never the aggregator; zero disables binding.
	address internal _payeeBinder;

	uint256[47] private __gap;

	event SettingManagerBool(bytes32 indexed what, address indexed value, uint256 status);
	event ProtocolAddressUpdated(bytes32 indexed what, address indexed treasuryAddress);
	event SetFeeRecipient(address indexed treasuryAddress);
	event TokenFeeSettingsUpdated(
		address indexed token,
		uint256 senderToTreasury,
		uint256 providerToTreasury
	);
	event GuardianUpdated(address indexed guardian);
	event MaxRebatePercentUpdated(uint64 maxRebatePercent);
	event PayeeBinderUpdated(address indexed payeeBinder);

	/* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */

	/**
	 * @dev Sets the boolean value for a specific setting.
	 * @param what The setting to be updated.
	 * @param value The address or value associated with the setting.
	 * @param status The boolean value to be set.
	 * Requirements:
	 * - The value must not be a zero address.
	 */
	function settingManagerBool(bytes32 what, address value, uint256 status) external onlyOwner {
		require(value != address(0), 'Gateway: zero address');
		require(status == 1 || status == 2, 'Gateway: invalid status');
		if (what == 'token') {
			_isTokenSupported[value] = status;
			emit SettingManagerBool(what, value, status);
		}
	}

	/**
	 * @dev Updates a protocol address.
	 * @param what The address type to be updated (treasury or aggregator).
	 * @param value The new address to be set.
	 * Requirements:
	 * - The value must not be a zero address.
	 */
	function updateProtocolAddress(bytes32 what, address value) external onlyOwner {
		require(value != address(0), 'Gateway: zero address');
		bool updated;
		if (what == 'treasury') {
			require(treasuryAddress != value, 'Gateway: treasury address already set');
			treasuryAddress = value;
			updated = true;
		} else if (what == 'aggregator') {
			require(_aggregatorAddress != value, 'Gateway: aggregator address already set');
			require(_payeeBinder != value, 'Gateway: aggregator is the payee binder');
			_aggregatorAddress = value;
			updated = true;
		}
		if (updated) {
			emit ProtocolAddressUpdated(what, value);
		}
	}

	/**
	 * @dev Sets token-specific fee settings for stablecoins.
	 * @param token The token address to configure.
	 * @param senderToTreasury BPS of sender fee paid to treasury.
	 * @param providerToTreasury BPS of order principal paid to treasury.
	 * Requirements:
	 * - The token must be supported.
	 * - Fee percentages must be within valid ranges.
	 */
	function setTokenFeeSettings(
		address token,
		uint256 senderToTreasury,
		uint256 providerToTreasury
	) external onlyOwner {
		require(_isTokenSupported[token] == 1, 'Gateway: token not supported');
		require(senderToTreasury <= MAX_BPS, 'Gateway: invalid sender to treasury');
		require(providerToTreasury <= MAX_BPS, 'Gateway: invalid provider to treasury');

		_tokenFeeSettings[token] = TokenFeeSettings({
			senderToProvider: 0,
			providerToAggregator: 0,
			senderToTreasury: senderToTreasury,
			providerToTreasury: providerToTreasury
		});

		emit TokenFeeSettingsUpdated(
			token,
			senderToTreasury,
			providerToTreasury
		);
	}

	/**
	 * @dev Sets the guardian, the key that can pause the Gateway and freeze settlement in an emergency.
	 * @param guardian The new guardian; the zero address removes it.
	 */
	function setGuardian(address guardian) external onlyOwner {
		_guardian = guardian;
		emit GuardianUpdated(guardian);
	}

	/**
	 * @dev Sets the highest rebate `settleOut` accepts.
	 * @param maxRebatePercent BPS of the treasury fee, at most MAX_BPS.
	 */
	function setMaxRebatePercent(uint64 maxRebatePercent) external onlyOwner {
		require(maxRebatePercent <= MAX_BPS, 'Gateway: invalid max rebate percent');
		_maxRebatePercent = maxRebatePercent;
		emit MaxRebatePercentUpdated(maxRebatePercent);
	}

	/**
	 * @dev Sets the payee binder, the key that binds payee lists with `setPayees`. It must not be the aggregator, so
	 * a single stolen key can neither bind a list to itself and settle to it, nor settle an unbound order.
	 * @param payeeBinder The new binder; the zero address disables `setPayees`.
	 */
	function setPayeeBinder(address payeeBinder) external onlyOwner {
		require(payeeBinder == address(0) || payeeBinder != _aggregatorAddress, 'Gateway: payee binder is the aggregator');
		_payeeBinder = payeeBinder;
		emit PayeeBinderUpdated(payeeBinder);
	}

	/**
	 * @dev Ownership cannot be renounced: an ownerless Gateway could never be unpaused or unfrozen.
	 */
	function renounceOwnership() public pure override {
		revert('Gateway: renounce disabled');
	}

	/**
	 * @dev Gets the payee binder.
	 */
	function getPayeeBinder() external view returns (address) {
		return _payeeBinder;
	}

	/**
	 * @dev Gets the guardian.
	 */
	function getGuardian() external view returns (address) {
		return _guardian;
	}

	/**
	 * @dev Gets the highest rebate `settleOut` accepts, in BPS of the treasury fee.
	 */
	function getMaxRebatePercent() external view returns (uint64) {
		return _maxRebatePercent;
	}

	/**
	 * @dev Gets token-specific fee settings.
	 * @param token The token address to query.
	 * @return TokenFeeSettings struct containing all fee settings for the token.
	 */
	function getTokenFeeSettings(address token) external view returns (TokenFeeSettings memory) {
		return _tokenFeeSettings[token];
	}
}
