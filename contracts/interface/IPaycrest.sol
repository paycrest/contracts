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
    event Deposit(address indexed token, uint256 indexed amount, bytes32 indexed orderId, uint256 rate, bytes32 institutionCode, bytes32 label, string messageHash);
    /// @dev Emitted when aggregator settle transaction.
    event Settled(bytes32 _splitOrderId, bytes32 indexed orderId, bytes32 label, address indexed liquidityProvider, uint96 settlePercent);
    /// @dev Emitted when aggregator refund transaction.
    event Refunded(bytes32 indexed orderId, bytes32 label);
    /// @dev Emitted when sender get therir rewards.
    event TransferSenderFee(address indexed sender, uint256 indexed amount);
    /// @dev Emitted when primary validator get therir rewards.
    event RewardValidator(address indexed validator, uint256 indexed amount);

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

    struct Order {
        address seller;                     //                                                                   slot 0
        address token;                      //                                                                   slot 1
        address senderFeeRecipient;
        uint256 senderFee;
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
    /// @param _institutionCode institution code of the sender.
    /// @param _label reference of the sender.
    /// @param _rate rate at which sender intended to sell `_amount` of `_token`.
    /// @param _senderFeeRecipient address that is going to recieve `_senderFee` in `_token` when there is a need to refund.
    /// @param _senderFee amount in the decimal of `_token` that is going to be paid to `_senderFeeRecipient` when there is a need to refund.
    /// @param _refundAddress address that is going to recieve `_amount` in `_token` when there is a need to refund.
    /// @param messageHash hash must be the result of a hash operation for the verification to be secure. message
    /// @return _orderId the bytes20 which is the orderId
    function createOrder(
        address _token, 
        uint256 _amount, 
        bytes32 _institutionCode,
        bytes32 _label,
        uint96 _rate, 
        address _senderFeeRecipient,
        uint256 _senderFee,
        address _refundAddress, 
        string calldata messageHash)  external returns(bytes32 _orderId);

    /// @notice settle transaction and distribute rewards accordingly.
    /// Requirements:
    /// {only aggregators call}.
    /// `_orderId` it must be less than total ids.
    /// `_orderId` it must be an open Id.
    /// `_primaryValidator` must have stake on the Paycrest staking platform.
    /// `_secondaryValidators` must have stake on the Paycrest staking platform.
    /// `amount` must be greater than minimum
    /// `_refundable` refundable address must not be zero address
    /// @param _orderId transaction Id.
    /// @param _label reference of the sender.
    /// @param _liquidityProvider address of the liquidity provider.
    /// @param _settlePercent rate at which the transaction is settled.
    /// @param _isPartner is the liquidity provider a partner.
    /// @return return the status of transaction {bool}
    function settle(bytes32 _splitOrderId, bytes32 _orderId, bytes32 _label, address _liquidityProvider, uint64 _settlePercent, bool _isPartner)  external returns(bytes32, address);

    /// @notice refund to the specified refundable address.
    /// Requirements:
    /// {only aggregators call}.
    /// `_orderId` it must be less than total ids.
    /// `_orderId` it must be an open Id.
    /// `isFulfilled` must be false.
    /// @param _orderId transaction Id.
    /// @param _label reference of the sender.
    /// @return return the status of transaction {bool}
    function refund(bytes32 _orderId, bytes32 _label)  external returns(bool);

    /// @notice get supported token from Paycrest.
    /// @param _token address of the token to check.
    /// @return return the status of `_token` {bool}
    function isTokenSupported(address _token) external view returns(bool);

    /// @notice get order details.
    /// @param _orderId transaction Id.
    function getOrderInfo(bytes32 _orderId) external view returns(Order memory);

    /// @notice get every rewards and address on Paycrest.
    /// @return protocolReward amount that will be taken in percentage on all trade.
    /// @return max_bps maximum amount in bps "100% == 100_000".
    function getFeeDetails() external view returns(
        uint64 protocolReward, 
        uint256 max_bps
    );

    /// @notice get address of liquidity aggregator.
    /// @return address of `Aggregator`.
    function getAggregatorAddress() external view returns(address);

    /// @notice get aggregator public key.
    /// @return aggregator public key.
    function getAggregator() external view returns(bytes memory);
    
    /// @notice get address of sender whitelisting status.
    /// @param sender address of the sender.
    /// @return address of `status`.
    function getWhitelistedStatus(address sender) external view returns(bool);

}
