//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
/**
 * @author Chef Photons, Paycrest Team serving high quality drinks; drink responsibly.
 * Factory and global config params
 */
interface IPaycrest {
    
    /* ##################################################################
                                EVENTS
    ################################################################## */
    /// @dev Emitted when deposit is made.
    event Deposit(bytes32 indexed orderId, uint256 indexed amount, uint256 indexed rate, bytes32 hash, bytes signature);
    /// @dev Emitted when aggregator settle transaction.
    event Settled(bytes32 indexed transactionId, address indexed liquidityProvider, uint96 settlePercent);
    /// @dev Emitted when aggregator refund transaction.
    event Refund(bytes32 indexed transactionId);

    /* ##################################################################
                                CUSTOM ERRORS
    ################################################################## */
    /// @notice Revert when caller is not an aggregator
    error OnlyAggregator();
    /// @notice Revert with invalid signer
    error InvalidSigner();
    /// @notice Revert when input amount is zero
    error Unsuported();
    /// @notice Revert when trx has been fulfilled
    error OrderFulfilled();
    /// @notice Revert when rewards are not been distributed.
    error UnableToProcessRewards();

    /* ##################################################################
                                STRUCTS
    ################################################################## */
    struct TransactionMetadata {
        bytes8 identifier;                 //                                                                   slot 0
        bytes8 institution;                //                                                                   slot 0
        bytes8 name;                       //                                                                   slot 0
        bytes8 currency;                   //                                                                   slot 0
        uint256 liquidityProviderID;       //                                                                   slot 1
    }

    struct OrderRecipient {
        address seller;                     //                                                                   slot 0
        address token;                      //                                                                   slot 1
        uint96 rate;                        //                                                                   slot 1
        bool isFulfilled;                   //                                                                   slot 2 {11 bytes available}
        address refundAddress;              //                                                                   slot 2 {12 bytes available}
        uint96 currentBPS;                  //                                                                   slot 2 {}
        uint256 amount;                     //                                                                   slot 3
    }


    /* ##################################################################
                                EXTERNAL CALLS
    ################################################################## */
    /// @notice lock sender `_amount` of `token` into Paycrest.
    /// Requirements:
    /// `msg.sender` must approve Paycrest contract on `_token` of at least `amount` before function call.
    /// `_token` must be an acceptable token. @dev See {isTokenSupported}.
    /// `amount` must be greater than minimum
    /// `_refundable` refundable address must not be zero address
    /// @param _token address of the token.
    /// @param _amount amount in the decimal of `_token` above.
    /// @param _refundAddress address that is going to recieve `_amount` in `_token` when there is a need to refund.
    /// @param _rate rate at which sender intended to sell `_amount` of `_token`.
    /// @param hash hash must be the result of a hash operation for the verification to be secure. message
    /// @param signature sig
    /// @return _transactionId the bytes20 which is the transactionId
    function newPositionOrder(address _token, uint256 _amount, address _refundAddress, uint96 _rate, bytes32 hash, bytes memory signature)  external returns(bytes32 _transactionId);

    /// @notice settle transaction and distribute rewards accordingly.
    /// Requirements:
    /// {only aggregators call}.
    /// `_transactionId` it must be less than total ids.
    /// `_transactionId` it must be an open Id.
    /// `_primaryValidator` must have stake on the Paycrest staking platform.
    /// `_secondaryValidators` must have stake on the Paycrest staking platform.
    /// `amount` must be greater than minimum
    /// `_refundable` refundable address must not be zero address
    /// @param _transactionId transaction Id.
    /// @param _primaryValidator address primary validator.
    /// @param _secondaryValidators arrays of secondary validators.
    /// @param _liquidityProvider address of the liquidity provider.
    /// @param _settlePercent rate at which the transaction is settled.
    /// @return return the status of transaction {bool}
    function settle(bytes32 _transactionId, address _primaryValidator, address[] calldata _secondaryValidators, address _liquidityProvider, uint96 _settlePercent)  external returns(bool);

    /// @notice refund to the specified refundable address.
    /// Requirements:
    /// {only aggregators call}.
    /// `_transactionId` it must be less than total ids.
    /// `_transactionId` it must be an open Id.
    /// `isFulfilled` must be false.
    /// @param _transactionId transaction Id.
    /// @return return the status of transaction {bool}
    function refund(bytes32 _transactionId)  external returns(bool);

    /// @notice get supported token from Paycrest.
    /// @param _token address of the token to check.
    /// @return return the status of `_token` {bool}
    function isTokenSupported(address _token) external view returns(bool);

    /// @notice get supported currencies from Paycrest.
    /// @return return the arrays of all supported currencies
    function getSupportedCurrencies() external view returns(bytes8[] memory);

    /// @notice get institution that supports the {`_currency`} Paycrest.
    /// @param _currency symbol of the currency to check for.
    /// @return institution the institution that supports inpute `_currency` {bytes32}
    function getSupportedInstitutions(bytes8 _currency) external view returns(bytes32 institution);

    /// @notice get every rewards and address on Paycrest.
    /// @return protocolReward amount that will be taken in percentage on all trade.
    /// @return primaryValidatorReward amount that will be given to primary validator in percentage from `protocolReward`
    /// @return secondaryValidatorReward amount that will be shared between secondary validator in percentage from `protocolReward`
    /// @return max_bps maximum amount in bps "100% == 100_000".
    function getFeeDetails() external view returns(
        uint64 protocolReward, 
        uint64 primaryValidatorReward, 
        uint64 secondaryValidatorReward,
        uint256 max_bps
    );

    /// @notice get address of liquidity aggregator.
    /// @return address of `liquidityAggregator`.
    function getLiquidityAggregator() external view returns(address);
    
}
