// SPDX-License-Identifier: UNLICENSED

/**
 * @title PaycrestSettingManager
 * @dev This contract manages the settings and configurations for the Paycrest protocol.
 */
pragma solidity ^0.8.18;

import '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol';

import {SharedStructs} from './libraries/SharedStructs.sol';

contract PaycrestSettingManager is Ownable2StepUpgradeable {
	uint256 internal MAX_BPS;
	uint64 internal protocolFeePercent;
	address internal treasuryAddress;
	address internal _aggregatorAddress;
	bytes internal _aggregator;

	// this should decrease if more slots are needed on this contract to avoid collisions with base contract
	uint256[50] private __gap;

	mapping(address => uint256) internal _isTokenSupported;

	mapping(bytes32 => SharedStructs.Institution[]) internal supportedInstitutions;
	mapping(bytes32 => SharedStructs.InstitutionByCode) internal supportedInstitutionsByCode;

	event SettingManagerBool(bytes32 indexed what, address indexed value, uint256 status);
	event SupportedInstitutionsUpdated(
		bytes32 indexed currency,
		SharedStructs.Institution[] institutions
	);
	event ProtocolFeesUpdated(uint64 protocolFee);
	event ProtocolAddressUpdated(bytes32 indexed what, address indexed treasuryAddress);
	event SetAggregator(bytes indexed aggregator);
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
		require(value != address(0), 'Paycrest: zero address');
		require(status == 1 || status == 2, 'Paycrest: invalid status');
		if (what == 'token') {
			_isTokenSupported[value] = status;
			emit SettingManagerBool(what, value, status);
		}
	}

	/**
	 * @dev Sets the supported institutions for a specific currency.
	 * @param currency The currency for which the institutions are being set.
	 * @param institutions The array of institutions to be set.
	 */
	function setSupportedInstitutions(
		bytes32 currency,
		SharedStructs.Institution[] memory institutions
	) external onlyOwner {
		delete supportedInstitutions[currency];
		for (uint i; i < institutions.length; ) {
			supportedInstitutions[currency].push(institutions[i]);
			supportedInstitutionsByCode[institutions[i].code] = SharedStructs.InstitutionByCode({
				name: institutions[i].name,
				currency: currency
			});
			unchecked {
				++i;
			}
		}
		emit SupportedInstitutionsUpdated(currency, supportedInstitutions[currency]);
	}

	/**
	 * @dev Updates the protocol fees percentage.
	 * @param _protocolFeePercent The new protocol fees percentage to be set.
	 */
	function updateProtocolFees(uint64 _protocolFeePercent) external onlyOwner {
		protocolFeePercent = _protocolFeePercent;
		emit ProtocolFeesUpdated(_protocolFeePercent);
	}

	/**
	 * @dev Updates a protocol address.
	 * @param what The address type to be updated (treasury or aggregator).
	 * @param value The new address to be set.
	 * Requirements:
	 * - The value must not be a zero address.
	 */
	function updateProtocolAddress(bytes32 what, address value) external onlyOwner {
		require(value != address(0), 'Paycrest: zero address');
		bool updated = false;
		if (what == 'treasury') {
			require(treasuryAddress != value, 'Paycrest: treasury address already set');
			treasuryAddress = value;
			updated = true;
		} else if (what == 'aggregator') {
			require(_aggregatorAddress != value, 'Paycrest: aggregator address already set');
			_aggregatorAddress = value;
			updated = true;
		}
		if (updated) {
			emit ProtocolAddressUpdated(what, value);
		}
	}

	/**
	 * @dev Updates the protocol aggregator.
	 * @param aggregator The new aggregator to be set.
	 */
	function updateProtocolAggregator(bytes calldata aggregator) external onlyOwner {
		_aggregator = aggregator;
		emit SetAggregator(aggregator);
	}
}
