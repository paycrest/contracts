//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import  "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

contract PaycrestValidator is OwnableUpgradeable, ReentrancyGuardUpgradeable { 
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    address private Paycrest;    
    bool private initialization;
    mapping(address => uint256) private minimumAmount;
    mapping(address => mapping (address => uint256)) private _balance;
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _paycrest) external initializer {    
        Paycrest = _paycrest;   
        initialization = true;
        __Ownable_init();
        __ReentrancyGuard_init();
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

    modifier OnlyPaycrest() {
        require(msg.sender == Paycrest, "Only Paycrest can call this function");
        _;
    }

    function setMinimumAmountForTokens(address _token, uint256 minimumStakeAmount) external onlyOwner {
        minimumAmount[_token] = minimumStakeAmount;
        emit NewTokenSupported(_token, minimumStakeAmount);
    }

    function initialized(bool status) external onlyOwner {
        initialization = status;
        emit Initialized(status);
    }

    function stake(address token, uint256 amount)  external {
        require(initialization, "Initialization is paused");
        require(_isTokenSupported(token), "Token is not supported");
        require(amount >= minimumAmount[token], "Amount is less than minimum required");
        IERC20Upgradeable(token).transferFrom(msg.sender, address(this), amount);
        _balance[msg.sender][token] += amount;
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount, address token, address recipient) external nonReentrant() {
        uint256 previouslyStakedAmount = _balance[msg.sender][token];
        require(amount <= previouslyStakedAmount, "Insufficient balance");
        _balance[msg.sender][token] -= amount;
        IERC20Upgradeable(token).transfer(recipient, amount);
        emit Withdrawn(msg.sender, amount);
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
