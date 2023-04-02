//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PaycrestSettingManager is Ownable { 
    uint256 internal constant MAX_BPS = 100_000;
    uint64 internal protocolFee = 5000; // 5%
    uint64 internal primaryValidatorFee = 500; // 0.5%
    uint64 internal secondaryValidatorFee = 500; // 0.5%
    address internal feeRecipient;
    address internal PaycrestStakingContract;

    mapping(address => bool) internal _isTokenSupported;
    mapping(address => bool) internal _liquidityAggregator;
    mapping(bytes8 => bytes8) internal supportedIntitutions;
    bytes8[] internal supportedCurrencies;

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

    /// @dev Emitted when aggregator refund transaction.
    event SettingManagerBool(bytes32 what, address value, bool status);
    event SettingManagerForInstitution(bytes32 what, bytes8 value, bytes8 status);
    event PaycrestFees(uint64 protocolFee, uint64 primaryvalidator, uint64 secondaryValidator);
    
    /* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */
    function settingManagerBool(bytes32 what, address value, bool status) external onlyOwner {
        if (value == address(0)) revert ThrowZeroAddress();
        if (what == "token") _isTokenSupported[value] = status;
        else if (what == "aggregator") _liquidityAggregator[value] = status;
        else revert InvalidParameter(what);
        emit SettingManagerBool(what, value, status);
    }

    function settingManagerForInstitution(bytes32 what, bytes8 value, bytes8 status) external onlyOwner {
        if (value == bytes8(0)) revert ThrowZeroValue();
        if (what == "currency") {
            supportedIntitutions[value] = status;
            supportedCurrencies.push(value);
        } else revert InvalidParameter(what);
        emit SettingManagerForInstitution(what, value, status);
    }

    function updateProtocolFees(uint64 _protocolFee, uint64 _primaryvalidator, uint64 _secondaryValidator) external onlyOwner {
        protocolFee = _protocolFee;
        primaryValidatorFee = _primaryvalidator;
        secondaryValidatorFee = _secondaryValidator;
        emit PaycrestFees(_protocolFee, _primaryvalidator, _secondaryValidator);
    }

    function updateFeeRecipient(bytes32 what, address value) external onlyOwner {
        if (value == address(0)) revert ThrowZeroAddress();
        if (what == "fee") feeRecipient = value;
        else if (what == "stake") PaycrestStakingContract = value;
    }

}
