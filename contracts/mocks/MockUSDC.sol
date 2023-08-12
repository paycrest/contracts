//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock mintable USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("MockUDSC", "MUSDC") {
        _mint(msg.sender, 1_000_000E18);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(uint256 _amount) external {
        _mint(msg.sender, _amount);
    }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }

    function burnAll() external {
        uint256 _balanceOf = balanceOf(msg.sender);
        require(_balanceOf > 0, "MockUSDC: Nothing to burn");
        _burn(msg.sender, _balanceOf);
    }
}
