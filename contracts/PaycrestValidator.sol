//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PaycrestValidator is Ownable, ReentrancyGuard { 
    using SafeERC20 for IERC20;
    
    address immutable private Paycrest;    
    bool private initialization;
    mapping(address => uint256) private minimumAmount;
    mapping(address => mapping (address => uint256)) private _balance;

    constructor(address _paycrest) {
        Paycrest = _paycrest;
        initialization = true;
    }

    event NewTokenSupported(address indexed token, uint256 indexed minimumStakeAmount);
    event Initialized(bool indexed status);
    event Staked(address indexed user, uint256 indexed amount);
    event Withdrawn(address indexed user, uint256 indexed amount);
    event RewardValidators(
        bytes32 orderId, 
        address token, 
        address indexed validator, 
        uint256 indexed validatorsReward
    );

    error ThrowInitPaused();
    error TokenNotSupported();
    error MinimumRequired();
    error Insufficient();

    function setMinimumAmountForTokens(address _token, uint256 minimumStakeAmount) external onlyOwner {
        minimumAmount[_token] = minimumStakeAmount;
        emit NewTokenSupported(_token, minimumStakeAmount);
    }

    function initialized(bool status) external onlyOwner {
        initialization = status;
        emit Initialized(status);
    }

    function stake(address token, uint256 amount)  external {
        if(!initialization) revert ThrowInitPaused();
        if(!_isTokenSupported(token)) revert TokenNotSupported();
        if(amount < minimumAmount[token]) revert MinimumRequired();
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        _balance[msg.sender][token] += amount;
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount, address token, address recipient) external nonReentrant() {
        uint256 previouslyStakedAmount = _balance[msg.sender][token];
        if(amount > previouslyStakedAmount) revert Insufficient();
        _balance[msg.sender][token] -= amount;
        IERC20(token).transfer(recipient, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function rewardValidators(
        bytes32 orderId, 
        address token, 
        address primaryValidator, 
        address[] memory secondaryValidators,
        uint256 primaryValidatorsReward, 
        uint256 secondaryValidatorsReward
    ) external returns(bool) {
        uint256 lengthOfSecondaryValidators = secondaryValidators.length;
        uint256 secondaryValidatorsShares = secondaryValidatorsReward / lengthOfSecondaryValidators;
        for(uint256 i = 0; i < lengthOfSecondaryValidators; ) {
            _balance[secondaryValidators[i]][token] += secondaryValidatorsShares;
            emit RewardValidators(orderId, token, secondaryValidators[i], secondaryValidatorsShares);
            unchecked {
                i++;
            }
        }
        _balance[primaryValidator][token] += primaryValidatorsReward;
        emit RewardValidators(orderId, token, primaryValidator, primaryValidatorsReward);
        return true;
    }


    function _isTokenSupported(address token) private view returns(bool) {
        (, bytes memory result) = Paycrest.staticcall(abi.encodeWithSignature("isTokenSupported(address)", token));
        return abi.decode(result, (bool));
    }

    function getPaycrest() external view returns(address) {
        return Paycrest;
    }

    function getInitializationState() external view returns(bool) {
        return initialization;
    }

    function getMinimumAmountRequiredFor(address token) external view returns(uint256) {
        return minimumAmount[token];
    }

    function getValidatorInfo(address user, address token) external view returns(uint256) {
        return _balance[user][token];
    }

}
