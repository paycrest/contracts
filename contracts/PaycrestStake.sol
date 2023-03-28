//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IPaycrestStake, IERC20} from "./interface/IPaycrestStake.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Paycrest is IPaycrestStake, Ownable { 
    using SafeERC20 for IERC20;
    
}
