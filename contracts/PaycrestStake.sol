//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Paycrest is Ownable { 
    using SafeERC20 for IERC20;
    struct UserInfor {
        uint256 amount;
        uint256 rewards;
    }
    
    address immutable private Paycrest;    
    bool private initialization;
    mapping(address => uint256) private _isTokenSupported;
    mapping(address => mapping (address => UserInfor)) private userInfo;

    constructor(address _paycrest) {
        Paycrest = _paycrest;
        initialization = true;
    }

    event NewTokenSupported(address indexed token, uint256 indexed minimumStakeAmount);
    event Initialized(bool indexed status);
    event Staked(address indexed user, uint256 indexed amount);
    event UnStaked(address indexed user, uint256 indexed amount);

    error ThrowInitPaused();
    error TokenNotSupported();
    error MinimumRequired();
    error Insufficient();

    function setSupportTokens(address _token, uint256 minimumStakeAmount) external onlyOwner {
        _isTokenSupported[_token] = minimumStakeAmount;
        emit NewTokenSupported(_token, minimumStakeAmount);
    }

    function initialized(bool status) external onlyOwner {
        initialization = status;
        emit Initialized(status);
    }

    function stake(address token, uint256 amount)  external {
        if(!initialization) revert ThrowInitPaused();
        if(_isTokenSupported[token] == 0) revert TokenNotSupported();
        if(amount < _isTokenSupported[token]) revert MinimumRequired();
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        userInfo[msg.sender][token].amount += amount;
        emit Staked(msg.sender, amount);
    }

    function unStake(uint256 amount, address token, address recipient) external {
        uint256 previouslyStakedAmount = userInfo[msg.sender][token].amount;
        if(amount > previouslyStakedAmount) revert Insufficient();
        
    }




    function getPaycrest() external view returns(address) {
        return Paycrest;
    }

    function getInitializationState() external view returns(bool) {
        return initialization;
    }

    function getMinimumAmountRequiredFor(address token) external view returns(uint256) {
        return _isTokenSupported[token];
    }

    function getUserinfo(address user, address token) external view returns(UserInfor memory) {
        return userInfo[user][token];
    }

}
