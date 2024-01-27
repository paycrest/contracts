// SPDX-License-Identifier: UNLICENSED

/**
 * @title PaycrestSettingManager
 * @dev This contract manages the settings and configurations for the Paycrest protocol.
 */
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {SharedStructs} from "./libraries/SharedStructs.sol";

contract PaycrestSettingManager is OwnableUpgradeable { 
    uint256 internal MAX_BPS;
    uint64 internal protocolFeePercent;
    address internal treasuryAddress;
    address internal _aggregatorAddress;
    bytes internal _aggregator;
    
    // this should decrease if more slots are needed on this contract to avoid collisions with base contract
    uint256[50] private __gap;

    mapping(address => bool) internal _isTokenSupported;

    mapping(bytes32 => SharedStructs.Institution[]) internal supportedInstitutions;
    mapping(bytes32 => SharedStructs.InstitutionByCode) internal supportedInstitutionsByCode;

    event SettingManagerBool(bytes32 what, address value, bool status);
    event ProtocolFeesUpdated(uint64 protocolFee);
    event ProtocolAddressesUpdated(address treasuryAddress);
    event SetAggregator(bytes aggregator);
    event SetFeeRecipient(address treasuryAddress);
    
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
    function settingManagerBool(bytes32 what, address value, bool status) external onlyOwner {
        require(value != address(0), "Paycrest: zero address");
        if (what == "token") _isTokenSupported[value] = status;

        emit SettingManagerBool(what, value, status);
    }

    /**
     * @dev Sets the supported institutions for a specific currency.
     * @param currency The currency for which the institutions are being set.
     * @param institutions The array of institutions to be set.
     */
    function setSupportedInstitutions(bytes32 currency, SharedStructs.Institution[] memory institutions) external onlyOwner { 
        uint256 length = institutions.length;
        for (uint i = 0; i < length; ) {
            supportedInstitutions[currency].push(institutions[i]);
            supportedInstitutionsByCode[institutions[i].code] = SharedStructs.InstitutionByCode({
                name: institutions[i].name, currency: currency
            });
            unchecked {
                i++;
            }
        }
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
     * @dev Updates the protocol addresses.
     * @param what The address type to be updated (treasury or aggregator).
     * @param value The new address to be set.
     * Requirements:
     * - The value must not be a zero address.
     */
    function updateProtocolAddresses(bytes32 what, address value) external onlyOwner {
        require(value != address(0), "Paycrest: zero address");
        if (what == "treasury") treasuryAddress = value;
        if (what == "aggregator") _aggregatorAddress = value;
        emit ProtocolAddressesUpdated(treasuryAddress);
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
