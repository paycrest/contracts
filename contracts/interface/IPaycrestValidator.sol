//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.18;

/**
 * @author Chef Photons, Vaultka Team serving high quality drinks; drink responsibly.
 * Factory and global config params
 */
interface IPaycrestValidator {
    function rewardValidators(bytes32 orderId, address token, address primaryValidator, address[] memory secondaryValidators, uint256 primaryValidatorsReward, uint256 secondaryValidatorsReward) external returns(bool);
}
