//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IPaycrest, IERC20} from "./interface/IPaycrest.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PaycrestSettingManager} from "./PaycrestSettingManager.sol";

contract Paycrest is IPaycrest, PaycrestSettingManager { 
    using SafeERC20 for IERC20;
    address immutable public USDC;
    mapping(bytes20 => TransactionData) private transactionData;

    constructor(address _usdc) {
        USDC = _usdc;
        _isDeposit[_usdc] = true;
    }

    modifier onlyAggregator {
        if(!_liquidityAggregator[msg.sender]) revert OnlyAggregator();
        _;
    }
    
    /* ##################################################################
                                USER CALLS
    ################################################################## */
    /** @dev See {deposit-IPaycrest}. */
    function deposit(Metadata memory _data, address _token, uint256 _amount, address _refundable, uint96 _rate)  external returns(bytes20 _transactionId) {
        // @todo each msg.sender nonce must be hash to the _transactionId
    }
    
    /* ##################################################################
                                KEEPER FUNCTIONS
    ################################################################## */
    /** @dev See {settle-IPaycrest}. */
    function settle(bytes20 _transactionId, address _primaryValidator, address[] calldata _secondaryValidators, address _liquidityProvider, uint96 _settlePercent)  external onlyAggregator() returns(bool) {
        
    }

    /** @dev See {refund-IPaycrest}. */
    function refund(bytes20 _transactionId)  external onlyAggregator() returns(bool) {

    }
    
    /* ##################################################################
                                VIEW CALLS
    ################################################################## */
    /** @dev See {isDeposit-IPaycrest}. */
    function isDeposit(address _token) external view returns(bool) {
        return _isDeposit[_token];
    }
}
