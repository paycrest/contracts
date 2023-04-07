//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PaycrestSettingManager} from "./PaycrestSettingManager.sol";
import {IPaycrestStake} from "./interface/IPaycrestStake.sol";
import {IPaycrest, IERC20} from "./interface/IPaycrest.sol";
contract Paycrest is IPaycrest, PaycrestSettingManager { 
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    uint256 constant public TimeLock = 12 hours;
    mapping(bytes32 => OrderRecipient) private orderRecipient;
    mapping(address => uint256) private _nonce;

    constructor(address _usdc) {
        _isTokenSupported[_usdc] = true;
    }

    modifier onlyAggregator {
        if(msg.sender != _liquidityAggregator) revert OnlyAggregator();
        _;
    }
    
    /* ##################################################################
                                USER CALLS
    ################################################################## */
    /** @dev See {newPositionOrder-IPaycrest}. */
    function newPositionOrder(address _token, uint256 _amount, address _refundAddress, uint96 _rate, bytes32 hash, bytes memory signature)  external returns(bytes32 orderId) {
        // checks that are required
        bool status = _verify(hash, signature);
        _handler(_token, _amount, _refundAddress, status);
        // first transfer token from msg.sender
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        // increase users nonce to avoid replay attacks
        _nonce[msg.sender] ++;
        // generate transaction id for the transaction
        orderId = keccak256(abi.encode(msg.sender, _nonce[msg.sender]));
        // update transaction
        orderRecipient[orderId] = OrderRecipient({
            seller: msg.sender,
            token: _token,
            rate: _rate,
            isFulfilled: false,
            refundAddress: _refundAddress,
            currentBPS: uint96(MAX_BPS),
            amount: _amount
        });
        // emit deposit event
        emit Deposit(orderId, _amount, _rate, hash, signature);
    }

    function _handler(address _token, uint256 _amount, address _refundAddress, bool status) internal view {
        if(!_isTokenSupported[_token]) revert TokenNotSupported();
        if(_amount == 0) revert AmountIsZero();
        if(_refundAddress == address(0)) revert ThrowZeroAddress();
        if(!status) revert InvalidSigner();
    }

    /* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
    /** @dev See {settle-IPaycrest}. */
    function settle(
        bytes32 _orderId, 
        address _primaryValidator, 
        address[] calldata _secondaryValidators, 
        address _liquidityProvider, 
        uint96 _settlePercent
        )  external onlyAggregator() returns(bool) {
        // ensure the transaction has not been fulfilled
        if(orderRecipient[_orderId].isFulfilled) revert OrderFulfilled();
        // load the token into memory
        address token = orderRecipient[_orderId].token;
        // substract sum of amount based on the input _settlePercent
        orderRecipient[_orderId].currentBPS -= _settlePercent     ;
        // if transaction amount is zero
        if(orderRecipient[_orderId].currentBPS == 0) {
            // update the transaction to be fulfilled
            orderRecipient[_orderId].isFulfilled = true;
        }

        // load the fees and transfer associated protocol fees to protocol fee recipient
        (
            uint256 protocolFee,
            uint256 liquidityProviderAmount, 
            uint256 primaryValidatorReward, 
            uint256 secondaryValidatorsReward
        ) = _calculateFees(_orderId, _settlePercent);
        // transfer protocol fee
        IERC20(token).transfer(feeRecipient, protocolFee);
        // transfer to liquidity provider 
        IERC20(token).transfer(_liquidityProvider, liquidityProviderAmount);
        // distribute rewards
        bool status = IPaycrestStake(PaycrestStakingContract).rewardValidators(
            _orderId,
            _primaryValidator, 
            _secondaryValidators, 
            primaryValidatorReward, 
            secondaryValidatorsReward
        );
        if(!status) revert UnableToProcessRewards();
        // emit event
        emit Settled(_orderId, _liquidityProvider, _settlePercent);
        return true;
    }

    /** @dev See {refund-IPaycrest}. */
    function refund(bytes32 _orderId)  external onlyAggregator() returns(bool) {
        // ensure the transaction has not been fulfilled
        if(orderRecipient[_orderId].isFulfilled) revert OrderFulfilled();
        // reser state values
        orderRecipient[_orderId].isFulfilled = true;
        orderRecipient[_orderId].currentBPS = 0;
        // transfer to liquidity provider 
        IERC20(orderRecipient[_orderId].token).transfer(orderRecipient[_orderId].refundAddress, orderRecipient[_orderId].amount);
        // emit
        emit Refund(_orderId);
        return true;
    }

    function _calculateFees(bytes32 _orderId, uint96 _settlePercent) private view returns(uint256 protocolFee, uint256 liquidityProviderAmount, uint256 primaryValidatorReward, uint256 secondaryValidatorsReward) {
        // get the total amount associated with the _transactionId
        uint256 amount = orderRecipient[_orderId].amount;
        // get the settled percent that is scheduled for this amount
        liquidityProviderAmount = (amount * _settlePercent) / MAX_BPS;
        // deduct protocol fees from the new total amount
        protocolFee = (liquidityProviderAmount * protocolFeePercent) * MAX_BPS; 
        // substract total fees from the new amount after getting the scheduled amount
        liquidityProviderAmount = (liquidityProviderAmount - protocolFee);
        // get primary validators fees primaryValidatorsReward
        primaryValidatorReward = (protocolFee * primaryValidatorFeePercent) / MAX_BPS;
        // get primary validators fees secondaryValidatorsReward
        secondaryValidatorsReward = (protocolFee * secondaryValidatorFeePercent) / MAX_BPS;
        // update new protocol fee
        protocolFee = protocolFee - (primaryValidatorReward + secondaryValidatorsReward);
    }

    function _verify(bytes32 messageHash, bytes memory signature) private view returns (bool) {
        bytes32 prefixedHash = messageHash.toEthSignedMessageHash();
        return prefixedHash.recover(signature) == _liquidityAggregator;
    }
    
    /* ##################################################################
                                VIEW CALLS
    ################################################################## */
    /** @dev See {isTokenSupported-IPaycrest}. */
    function isTokenSupported(address _token) external view returns(bool) {
        return _isTokenSupported[_token];
    }

    /** @dev See {getSupportedCurrencies-IPaycrest}. */
    function getSupportedCurrencies() external view returns(bytes8[] memory) {
        uint256 getlength = supportedCurrencies.length;
        bytes8[] memory allCurrencies = new bytes8[](getlength);
        for(uint256 i; i < getlength; ) {
            allCurrencies[i] = supportedCurrencies[i];
            unchecked {
                i++;
            }
        }
        return allCurrencies;
    }

    /** @dev See {getSupportedInstitutions-IPaycrest}. */
    function getSupportedInstitutions(bytes8 _currency) external view returns(bytes32 institution) {
        return supportedIntitutions[_currency];
    }

    /** @dev See {getProtocolFees-IPaycrest}. */
    function getFeeDetails() external view returns(
        uint64, 
        uint64, 
        uint64,
        uint256
    ) {
        protocolFeePercent;
        primaryValidatorFeePercent;
        secondaryValidatorFeePercent;
        MAX_BPS;
    }

    /** @dev See {getSupportedInstitutions-IPaycrest}. */
    function getLiquidityAggregator() external view returns(address) {
        return _liquidityAggregator;
    }

}
