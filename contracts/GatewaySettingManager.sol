// SPDX-License-Identifier: UNLICENSED

/**
 * @title GatewaySettingManager
 * @dev This contract manages the settings and configurations for the Gateway protocol.
 */
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';

contract GatewaySettingManager is Ownable2StepUpgradeable {
	uint256 internal MAX_BPS;
	uint64 internal protocolFeePercent;
	address internal treasuryAddress;
	address internal _aggregatorAddress;
	mapping(address => uint256) internal _isTokenSupported;

	// Token-specific fee settings
	struct TokenFeeSettings {
		uint256 senderToProvider; // % of sender fee that goes to provider (local mode)
		uint256 providerToAggregator; // % of provider's share that goes to aggregator (local mode)
		uint256 senderToAggregator; // % of sender fee that goes to aggregator (fx mode)
		uint256 providerToAggregatorFx; // % of transaction amount provider pays to aggregator (fx mode)
	}

	mapping(address => TokenFeeSettings) internal _tokenFeeSettings;

	uint256[49] private __gap;

	event SettingManagerBool(bytes32 indexed what, address indexed value, uint256 status);
	event ProtocolAddressUpdated(bytes32 indexed what, address indexed treasuryAddress);
	event SetFeeRecipient(address indexed treasuryAddress);
	event TokenFeeSettingsUpdated(
		address indexed token,
		uint256 senderToProvider,
		uint256 providerToAggregator,
		uint256 senderToAggregator,
		uint256 providerToAggregatorFx
	);

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
	 * @param senderToProvider Percentage of sender fee that goes to provider (local mode).
	 * @param providerToAggregator Percentage of provider's share that goes to aggregator (local mode).
	 * @param senderToAggregator Percentage of sender fee that goes to aggregator (fx mode).
	 * @param providerToAggregatorFx Percentage of transaction amount provider pays to aggregator (fx mode).
	 * Requirements:
	 * - The token must be supported.
	 * - Fee percentages must be within valid ranges.
	 */
	function setTokenFeeSettings(
		address token,
		uint256 senderToProvider,
		uint256 providerToAggregator,
		uint256 senderToAggregator,
		uint256 providerToAggregatorFx
	) external onlyOwner {
		require(_isTokenSupported[token] == 1, 'Gateway: token not supported');
		require(senderToProvider <= MAX_BPS, 'Gateway: invalid sender to provider');
		require(providerToAggregator <= MAX_BPS, 'Gateway: invalid provider to aggregator');
		require(senderToAggregator <= MAX_BPS, 'Gateway: invalid sender to aggregator');
		require(providerToAggregatorFx <= MAX_BPS, 'Gateway: invalid provider to aggregator fx');

		_tokenFeeSettings[token] = TokenFeeSettings({
			senderToProvider: senderToProvider,
			providerToAggregator: providerToAggregator,
			senderToAggregator: senderToAggregator,
			providerToAggregatorFx: providerToAggregatorFx
		});

		emit TokenFeeSettingsUpdated(
			token,
			senderToProvider,
			providerToAggregator,
			senderToAggregator,
			providerToAggregatorFx
		);
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
