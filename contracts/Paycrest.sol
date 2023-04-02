//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IPaycrest, IERC20} from "./interface/IPaycrest.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PaycrestSettingManager} from "./PaycrestSettingManager.sol";
import {IPaycrestStake} from "./interface/IPaycrestStake.sol";
contract Paycrest is IPaycrest, PaycrestSettingManager { 
    using SafeERC20 for IERC20;
    address immutable public USDC;
    uint256 constant public TimeLock = 12 hours;
    mapping(bytes32 => Transaction) private transaction;
    mapping(address => uint256) private _nonce;

    constructor(address _usdc) {
        USDC = _usdc;
        _isTokenSupported[_usdc] = true;
    }

    modifier onlyAggregator {
        if(!_liquidityAggregator[msg.sender]) revert OnlyAggregator();
        _;
    }
    
    /* ##################################################################
                                USER CALLS
    ################################################################## */
    /** @dev See {deposit-IPaycrest}. */
    function deposit(TransactionMetadata memory metadata, address _token, uint256 _amount, address _refundAddress, uint96 _rate)  external returns(bytes32 transactionId) {
        // checks that are required
        _handler(_token, _amount, _refundAddress, metadata.currency);
        // first transfer token from msg.sender
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        // increase users noce to avoid replay attacks
        _nonce[msg.sender] ++;
        // generate transaction id for the transaction
        transactionId = keccak256(abi.encode(metadata, _nonce[msg.sender]));
        // update transaction
        transaction[transactionId] = Transaction({
            seller: msg.sender,
            token: _token,
            rate: _rate,
            isFulfilled: false,
            refundAddress: _refundAddress,
            unlockTime: uint96(block.timestamp + TimeLock),
            amount: _amount
        });
        // emit deposit event
        emit Deposit(transactionId, _amount, _rate, metadata);
    }

    function _handler(address _token, uint256 _amount, address _refundAddress, bytes8 currency) internal view {
        if(!_isTokenSupported[_token]) revert TokenNotSupported();
        if(_amount == 0) revert AmountIsZero();
        if(_refundAddress == address(0)) revert ThrowZeroAddress();
        // saving 2115
        if(supportedIntitutions[currency] == bytes4(0)) revert ThrowZeroAddress();
    }

    /* ##################################################################
                                AGGREGATOR FUNCTIONS
    ################################################################## */
    /** @dev See {settle-IPaycrest}. */
    function settle(
        bytes32 _transactionId, 
        address _primaryValidator, 
        address[] calldata _secondaryValidators, 
        address _liquidityProvider, 
        uint96 _settlePercent
        )  external onlyAggregator() returns(bool) {
        // ensure the transaction has not been fulfilled
        if(transaction[_transactionId].isFulfilled) revert TXFulfilled();
        // load the token into memory
        address token = transaction[_transactionId].token;
        // load the fees and transfer associated protocol fees to protocol fee recipient
        (
            uint256 sumAmount,
            uint256 liquidityProviderAmount, 
            uint256 primaryValidatorsReward, 
            uint256 secondaryValidatorsReward
        ) = calculateFees(token, _transactionId, _settlePercent); // verify that this wont have impart on the protocol cause of reentrancy
        // substract sum of amount based on the input _settlePercent
        transaction[_transactionId].amount -= sumAmount;
        // if transaction amount is zero
        if(transaction[_transactionId].amount == 0) {
            // update the transaction to be fulfilled
            transaction[_transactionId].isFulfilled = true;
        }
        // transfer to liquidity provider 
        IERC20(token).transfer(_liquidityProvider, liquidityProviderAmount);
        // distribute rewards
        bool status = IPaycrestStake(PaycrestStakingContract).rewardValidators(
            _primaryValidator, 
            _secondaryValidators, 
            primaryValidatorsReward, 
            secondaryValidatorsReward
        );
        if(!status) revert UnableToProcessRewards();
        // emit event
        emit Settle(_transactionId, _liquidityProvider, _settlePercent);
        return true;
    }

    /** @dev See {refund-IPaycrest}. */
    function refund(bytes32 _transactionId)  external onlyAggregator() returns(bool) {
        // ensure the transaction has not been fulfilled
        if(transaction[_transactionId].isFulfilled) revert TXFulfilled();
        // load the amount
        uint256 amount = transaction[_transactionId].amount;
        // @todo might not be necessary to check this but verify during unit test
        if(amount == 0) revert TXFulfilled();
        // reser state values
        transaction[_transactionId].isFulfilled = true;
        transaction[_transactionId].amount = 0;
        // transfer to liquidity provider 
        IERC20(transaction[_transactionId].token).transfer(transaction[_transactionId].refundAddress, amount);
        // emit
        emit Refund(_transactionId);
        return true;
    }

    function calculateFees(address token, bytes32 _transactionId, uint96 _settlePercent) private returns(uint256 sumAmount, uint256 liquidityProviderAmount, uint256 primaryValidatorsReward, uint256 secondaryValidatorsReward) {
        // get the total amount associated with the _transactionId
        uint256 amount = transaction[_transactionId].amount;
        // get the settled percent that is scheduled for this amount
        liquidityProviderAmount = (amount * _settlePercent) / MAX_BPS;
        // return sum amount 
        sumAmount = amount - liquidityProviderAmount;
        // deduct protocol fees from the new total amount
        uint256 totalFees = (liquidityProviderAmount * protocolFee) * MAX_BPS; 
        // substract total fees from the new amount after getting the scheduled amount
        liquidityProviderAmount = (liquidityProviderAmount - totalFees);
        // get primary validators fees primaryValidatorsReward
        primaryValidatorsReward = (totalFees * primaryValidatorFee) / MAX_BPS;
        // get primary validators fees secondaryValidatorsReward
        secondaryValidatorsReward = (totalFees * secondaryValidatorFee) / MAX_BPS;
        // update new protocol fee
        totalFees = totalFees - (primaryValidatorsReward + secondaryValidatorsReward);
        // transfer protocol fee
        IERC20(token).transfer(feeRecipient, totalFees);
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
        uint256 getlenght = supportedCurrencies.length;
        bytes8[] memory allCurrencies = new bytes8[](getlenght);
        for(uint256 i; i < getlenght; ) {
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
    function getProtocolFees() external view returns(
        address recipient, 
        uint64 protocolReward, 
        uint64 primaryValidatorReward, 
        uint64 secondaryValidatorReward,
        uint256 max_bps
    ) {
        recipient = feeRecipient;
        protocolReward = protocolFee;
        primaryValidatorReward = primaryValidatorFee;
        secondaryValidatorReward = secondaryValidatorFee;
        max_bps = MAX_BPS;
    }

    /** @dev See {getSupportedInstitutions-IPaycrest}. */
    function getLiquidityAggregatorStatus(address liquidityAggregator) external view returns(bool) {
        return _liquidityAggregator[liquidityAggregator];
    }

}
