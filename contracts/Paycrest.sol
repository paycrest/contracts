//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {IPaycrest, IERC20} from "./interface/IPaycrest.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Paycrest is IPaycrest, Ownable { 
    using SafeERC20 for IERC20;
    
}
