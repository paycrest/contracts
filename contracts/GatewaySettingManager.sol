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

	// this should decrease if more slots are needed on this contract to avoid collisions with base contract
	uint256[50] private __gap;


	event SettingManagerBool(bytes32 indexed what, address indexed value, uint256 status);
	event ProtocolFeeUpdated(uint64 protocolFee);
	event ProtocolAddressUpdated(bytes32 indexed what, address indexed treasuryAddress);
	event SetFeeRecipient(address indexed treasuryAddress);

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
	 * @dev Updates the protocol fee percentage.
	 * @param _protocolFeePercent The new protocol fee percentage to be set.
	 */
	function updateProtocolFee(uint64 _protocolFeePercent) external onlyOwner {
		protocolFeePercent = _protocolFeePercent;
		emit ProtocolFeeUpdated(_protocolFeePercent);
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
}
