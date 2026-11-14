// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from 'forge-std/Test.sol';
import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Gateway} from '../../contracts/Gateway.sol';
import {IGateway} from '../../contracts/interfaces/IGateway.sol';
import {MockUSDT} from '../../contracts/mocks/MockUSDC.sol';

/**
 * @dev Shared fixture for the Gateway suites: the Gateway behind a TransparentUpgradeableProxy (as deployed and as
 * `test/fixtures/gateway.js` builds it), initialized by this contract (the owner), with a treasury, an aggregator
 * and one supported mock token.
 */
abstract contract GatewayBase is Test {
	uint256 internal constant MAX_BPS = 100_000;

	Gateway internal impl;
	ProxyAdmin internal proxyAdmin;
	Gateway internal gateway;
	MockUSDT internal token;

	address internal owner;
	address internal aggregator = address(uint160(0xA66));
	address internal treasury = address(uint160(0x7EA5));

	function setUp() public virtual {
		_deploy();
	}

	function _deploy() internal {
		owner = address(this);
		impl = new Gateway();
		proxyAdmin = new ProxyAdmin();
		TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
			address(impl),
			address(proxyAdmin),
			abi.encodeCall(Gateway.initialize, ())
		);
		gateway = Gateway(address(proxy));
		gateway.updateProtocolAddress('treasury', treasury);
		gateway.updateProtocolAddress('aggregator', aggregator);
		token = new MockUSDT();
		gateway.settingManagerBool('token', address(token), 1);
	}

	/* ------------------------------------------------------------------ helpers */

	/// Mints `amount` to `who` and approves the Gateway for it.
	function _fund(address who, uint256 amount) internal {
		vm.startPrank(who);
		token.mint(amount);
		token.approve(address(gateway), type(uint256).max);
		vm.stopPrank();
	}

	function _setFees(uint256 senderToTreasury, uint256 providerToTreasury) internal {
		gateway.setTokenFeeSettings(address(token), senderToTreasury, providerToTreasury);
	}

	function _create(
		address sender,
		uint256 amount,
		uint256 senderFee,
		address feeRecipient,
		address refundAddress
	) internal returns (bytes32 id) {
		_fund(sender, amount + senderFee);
		vm.prank(sender);
		id = gateway.createOrder(address(token), amount, 1500, feeRecipient, senderFee, refundAddress, 'msg');
	}

	function _settleOut(bytes32 id, address provider, uint64 pct, uint64 rebate) internal returns (bool) {
		vm.prank(aggregator);
		return gateway.settleOut(bytes32(uint256(1)), id, provider, pct, rebate);
	}

	function _refund(bytes32 id, uint256 fee) internal returns (bool) {
		vm.prank(aggregator);
		return gateway.refund(fee, id);
	}

	function _order(bytes32 id) internal view returns (IGateway.Order memory) {
		return gateway.getOrderInfo(id);
	}

	function _bal(address who) internal view returns (uint256) {
		return token.balanceOf(who);
	}

	/// The id `createOrder` gives the `n`-th order of `sender` (P5).
	function _orderId(address sender, uint256 n) internal view returns (bytes32) {
		return keccak256(abi.encode(sender, n, block.chainid));
	}

	/// Sender fee share paid to the recipient (P11).
	function _feeToRecipient(uint256 fee, uint256 senderToTreasury) internal pure returns (uint256) {
		return fee - (fee * senderToTreasury) / MAX_BPS;
	}
}
