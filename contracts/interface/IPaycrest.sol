//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
/**
 * @author Chef Photons, Vaultka Team serving high quality drinks; drink responsibly.
 * Factory and global config params
 */
interface IPaycrest {
    
    /* ##################################################################
                                EVENTS
    ################################################################## */
    /// @dev Emitted when deposit is made.
    event Deposit(bytes20 indexed transactionId, uint256 indexed amount, uint256 indexed rate, uint256 time);
    /// @dev Emitted when deposit is made in other to update state of transaction.
    event Transaction(bytes8 indexed identifier, bytes8 indexed institution, bytes4 name, bytes4 currency, uint256 indexed liquidityProviderID);
    /// @dev Emitted when aggregator settle transaction.
    event Settle(bytes8 indexed transactionId, address indexed _liquidityProvider, uint96 _settlePercent, uint256 time);
    /// @dev Emitted when aggregator refund transaction.
    event Refund(bytes8 indexed transactionId, uint256 indexed time);

    /* ##################################################################
                                CUSTOM ERRORS
    ################################################################## */
    /// @notice Revert when caller is not an aggregator
    error OnlyAggregator();
    

    /* ##################################################################
                                STRUCTS
    ################################################################## */
    struct Metadata {
        bytes8      identifier;                 //                                                                   slot 0
        bytes8      institution;                //                                                                   slot 0
        bytes4      name;                       //                                                                   slot 0
        bytes4      currency;                   //                                                                   slot 0
        uint256     liquidityProviderID;        //                                                                   slot 1
    }

    struct TransactionData {
        address      seller;                    //                                                                   slot 0
        uint96       rate;                      //                                                                   slot 0
        address      refundable;                //                                                                   slot 1 {12 bytes available}
        bool         isFulfilled;               //                                                                   slot 1 {11 bytes available}
        uint256      amount;                    //                                                                   slot 2
    }


    /* ##################################################################
                                EXTERNAL CALLS
    ################################################################## */
    /// @notice lock sender `_amount` of `token` into paycrest.
    /// Requirements:
    /// `msg.sender` must approve paycrest contract on `_token` of at least `amount` before function call.
    /// `_token` must be an acceptable token. @dev See {isDeposit}.
    /// `amount` must be greater than minimum
    /// `_refundable` refundable address must not be zero address
    /// @param _data sender metadata.
    /// @param _token address of the token.
    /// @param _amount amount in the decimal of `_token` above.
    /// @param _refundable address that is going to recieve `_amount` in `_token` when there is a need to refund.
    /// @param _rate rate at which sender intended to sell `_amount` of `_token`.
    /// @return _transactionId the bytes20 which is the transactionId
    function deposit(Metadata memory _data, address _token, uint256 _amount, address _refundable, uint96 _rate)  external returns(bytes20 _transactionId);

    /// @notice settle transaction and distribute rewards accordingly.
    /// Requirements:
    /// {only aggregators call}.
    /// `_transactionId` it must be less than total ids.
    /// `_transactionId` it must be an open Id.
    /// `_primaryValidator` must must have stake on the paycrest staking platform.
    /// `_secondaryValidators` must must have stake on the paycrest staking platform.
    /// `amount` must be greater than minimum
    /// `_refundable` refundable address must not be zero address
    /// @param _transactionId transaction Id.
    /// @param _primaryValidator address primary validator.
    /// @param _secondaryValidators arrays of secondary validators.
    /// @param _liquidityProvider address of the liquidity provider.
    /// @param _settlePercent rate at which the transaction is settled.
    /// @return return the status of transaction {bool}
    function settle(bytes20 _transactionId, address _primaryValidator, address[] calldata _secondaryValidators, address _liquidityProvider, uint96 _settlePercent)  external returns(bool);

    /// @notice refund to the specified refundable address.
    /// Requirements:
    /// {only aggregators call}.
    /// `_transactionId` it must be less than total ids.
    /// `_transactionId` it must be an open Id.
    /// `isFulfilled` must be false.
    /// @param _transactionId transaction Id.
    /// @return return the status of transaction {bool}
    function refund(bytes20 _transactionId)  external returns(bool);



    /// @notice get supported token from paycrest.
    /// @param _token address of the token to check.
    /// @return return the status of `_token` {bool}
    function isDeposit(address _token) external view returns(bool);


    
}
