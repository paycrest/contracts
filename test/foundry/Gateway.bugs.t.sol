// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {GatewayBase} from './GatewayBase.sol';

/**
 * @title GatewayKnownViolations
 * @notice Tests for the violations in docs/gateway-spec.md §6. Each asserts the behaviour the contract SHOULD have
 * and FAILS on the code as deployed today. They skip unless GW_KNOWN_BUGS=true, so every gate that runs
 * test/foundry (gw-verify, otc-verify, bcs-verify) stays meaningful; run them with `make gw-known-bugs`. When the
 * fix lands, delete the skip and move the test into Gateway.t.sol under its own property id.
 */
contract GatewayKnownViolations is GatewayBase {
	address internal victim = address(uint160(0x71C71));
	address internal attacker = address(uint160(0xBAD));

	/// V1: `settleIn` is permissionless and books any unused `_orderId`, and `createOrder` ids are predictable
	/// (`keccak256(abi.encode(sender, nonce + 1, chainid))`). The attacker books the victim's next id for one unit
	/// of a supported token, paid straight back to the attacker. The victim's `createOrder` then reverts with
	/// `OrderAlreadyExists`; the revert also undoes the nonce increment, so every retry hits the same id.
	function setUp() public override {
		vm.skip(!vm.envOr('GW_KNOWN_BUGS', false));
		super.setUp();
	}

	function test_bug_V1_settleInSquatsTheNextCreateOrderId() public {
		bytes32 next = _orderId(victim, 1);
		_fund(attacker, 1);
		vm.prank(attacker);
		gateway.settleIn(next, address(token), 1, address(0), 0, attacker, 1, 0);
		assertEq(token.balanceOf(attacker), 1, 'the squat costs the attacker nothing but gas');

		_fund(victim, 1_000_000);
		vm.prank(victim);
		// Should succeed: a third party must not be able to stop an address from creating orders.
		gateway.createOrder(address(token), 1_000_000, 1500, address(0), 0, victim, 'msg');
	}
}
