//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PaycrestSettingManager is Ownable { 
    struct Institution {
        bytes32 code; // usually not more than 8 letters
        bytes32 name; // 
    }
    struct InstitutionByCode {
        bytes32 name;
        bytes32 currency;
    }
    uint256 internal constant MAX_BPS = 100_000;
    uint64 internal protocolFeePercent = 5000; // 5%
    uint64 internal primaryValidatorFeePercent = 500; // 0.5%
    uint64 internal secondaryValidatorFeePercent = 500; // 0.5%
    address internal feeRecipient;
    address internal PaycrestStakingContract;
    address internal _liquidityAggregator;

    mapping(address => bool) internal _isTokenSupported;
    mapping(address => bool) internal _isWhitelisted;

    mapping(bytes32 => Institution[]) internal supportedInstitutions;
    mapping(bytes32 => InstitutionByCode) internal supportedInstitutionsByCode;

    /// @notice Revert when zero address is passed in
    error ThrowZeroAddress();
    /// @notice Revert when zero address is passed in
    error ThrowZeroValue();
    /// @notice Revert when zero address is passed in
    error InvalidParameter(bytes32 what);
    /// @notice Revert when invalid token is provided
    error TokenNotSupported();
    /// @notice Revert when input amount is zero
    error AmountIsZero();

    event SettingManagerBool(bytes32 what, address value, bool status);
    event SettingManagerForInstitution(bytes32 what, bytes8 value, bytes8 status);
    event PaycrestFees(uint64 protocolFee, uint64 primaryValidator, uint64 secondaryValidator);
    
    /* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */
    function settingManagerBool(bytes32 what, address value, bool status) external onlyOwner {
        if (value == address(0)) revert ThrowZeroAddress();
        if (what == "token") _isTokenSupported[value] = status;
        if (what == "whitelist") _isWhitelisted[value] = status;
        else revert InvalidParameter(what);
        emit SettingManagerBool(what, value, status);
    }

    function setSupportedInstitutions(bytes32 currency, Institution[] memory institutions) external onlyOwner { 
        uint256 length = institutions.length;
        for (uint i = 0; i < length; ) {
            supportedInstitutions[currency].push(institutions[i]);
            supportedInstitutionsByCode[institutions[i].code] = InstitutionByCode({
                name: institutions[i].name, currency: currency
            });
            unchecked {
                i++;
            }
        }
    }

    function updateProtocolFees(uint64 _protocolFeePercent, uint64 _primaryValidatorPercent, uint64 _secondaryValidatorPercent) external onlyOwner {
        protocolFeePercent = _protocolFeePercent;
        primaryValidatorFeePercent = _primaryValidatorPercent;
        secondaryValidatorFeePercent = _secondaryValidatorPercent;
        emit PaycrestFees(_protocolFeePercent, _primaryValidatorPercent, _secondaryValidatorPercent);
    }

    function updateFeeRecipient(bytes32 what, address value) external onlyOwner {
        if (value == address(0)) revert ThrowZeroAddress();
        if (what == "fee") feeRecipient = value;
        if (what == "aggregator") _liquidityAggregator = value;
        else if (what == "stake") PaycrestStakingContract = value;
    }

}
