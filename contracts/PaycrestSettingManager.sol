//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PaycrestSettingManager is Ownable { 
        
    mapping(address => bool) internal _isDeposit;
    mapping(address => bool) internal _liquidityAggregator;
    
    /* ##################################################################
                                OWNER FUNCTIONS
    ################################################################## */
    function setDepositToken(address _token, bool _status) external onlyOwner() {
        _isDeposit[_token] = _status;
    }

    function setKeeper(address _aggregator, bool _status) external onlyOwner() {
        _liquidityAggregator[_aggregator] = _status;
    }

}
