// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Gateway} from '../../contracts/Gateway.sol';
import {IGateway} from '../../contracts/interfaces/IGateway.sol';
import {MockUSDT} from '../../contracts/mocks/MockUSDC.sol';
import {GatewayBase} from './GatewayBase.sol';

/**
 * @title GatewayTest
 * @notice Unit and fuzz tests for docs/gateway-spec.md. Test names carry the property id they establish.
 */
contract GatewayTest is GatewayBase {
	address internal alice = address(uint160(0xA11CE));
	address internal bob = address(uint160(0xB0B));
	address internal feeRecipient = address(uint160(0xFEE));
	address internal refundTo = address(uint160(0x2EF));
	address internal provider = address(uint160(0x9120));
	address internal provider2 = address(uint160(0x9121));
	address internal recipient = address(uint160(0x2EC1));

	// IGateway's events, redeclared for vm.expectEmit (solc 0.8.20 cannot emit them qualified).
	event SettleIn(
		bytes32 indexed orderId,
		address indexed liquidityProvider,
		address indexed recipient,
		uint256 amount,
		address token,
		uint256 aggregatorFee,
		uint96 rate,
		uint64 rebatePercent
	);
	event SenderFeeTransferred(bytes32 indexed orderId, address indexed sender, uint256 indexed amount);
	event TransferFeeSplit(bytes32 indexed orderId, uint256 senderAmount, uint256 aggregatorAmount);
	event OrderPayeesSet(bytes32 indexed orderId, address[] payees);
	event SettlementFrozen(address indexed by);
	event SettlementUnfrozen(address indexed by);
	event GuardianUpdated(address indexed guardian);
	event MaxRebatePercentUpdated(uint64 maxRebatePercent);

	/* ==================================================================================== P1 */

	function testFuzz_P1_settersRevertForNonOwner(address caller) public {
		vm.assume(caller != owner && caller != address(proxyAdmin));
		bytes memory notOwner = 'Ownable: caller is not the owner';

		vm.startPrank(caller);
		vm.expectRevert(notOwner);
		gateway.settingManagerBool('token', address(0x1234), 1);
		vm.expectRevert(notOwner);
		gateway.updateProtocolAddress('treasury', address(0x1234));
		vm.expectRevert(notOwner);
		gateway.setTokenFeeSettings(address(token), 1, 1);
		vm.expectRevert('OnlyOwnerOrGuardian');
		gateway.pause();
		vm.expectRevert(notOwner);
		gateway.unpause();
		vm.expectRevert('OnlyOwnerOrGuardian');
		gateway.freezeSettlement();
		vm.expectRevert(notOwner);
		gateway.unfreezeSettlement();
		vm.expectRevert(notOwner);
		gateway.setGuardian(caller);
		vm.expectRevert(notOwner);
		gateway.setMaxRebatePercent(1);
		vm.expectRevert(notOwner);
		gateway.transferOwnership(caller);
		vm.stopPrank();
	}

	function test_P1_ownershipMovesInTwoSteps() public {
		address next = address(uint160(0x0E3));
		gateway.transferOwnership(next);
		assertEq(gateway.owner(), owner, 'owner unchanged until accepted');
		assertEq(gateway.pendingOwner(), next);

		vm.prank(bob);
		vm.expectRevert('Ownable2Step: caller is not the new owner');
		gateway.acceptOwnership();

		vm.prank(next);
		gateway.acceptOwnership();
		assertEq(gateway.owner(), next);

		vm.expectRevert('OnlyOwnerOrGuardian');
		gateway.pause();
	}

	function test_P1_guardianCanOnlyPauseAndFreeze() public {
		address guardian = address(uint160(0x6A2D));
		vm.expectEmit(true, false, false, true, address(gateway));
		emit GuardianUpdated(guardian);
		gateway.setGuardian(guardian);
		assertEq(gateway.getGuardian(), guardian);

		vm.startPrank(guardian);
		gateway.pause();
		assertTrue(gateway.paused());
		vm.expectRevert('Ownable: caller is not the owner');
		gateway.unpause();
		vm.expectEmit(true, false, false, true, address(gateway));
		emit SettlementFrozen(guardian);
		gateway.freezeSettlement();
		assertTrue(gateway.isSettlementFrozen());
		vm.expectRevert('Ownable: caller is not the owner');
		gateway.unfreezeSettlement();
		vm.expectRevert('Ownable: caller is not the owner');
		gateway.setGuardian(address(0));
		vm.expectRevert('Ownable: caller is not the owner');
		gateway.setMaxRebatePercent(0);
		vm.expectRevert('Ownable: caller is not the owner');
		gateway.updateProtocolAddress('aggregator', guardian);
		vm.stopPrank();

		gateway.unpause();
		vm.expectEmit(true, false, false, true, address(gateway));
		emit SettlementUnfrozen(owner);
		gateway.unfreezeSettlement();

		// Removing the guardian takes its powers away; the zero address never holds them.
		gateway.setGuardian(address(0));
		vm.prank(guardian);
		vm.expectRevert('OnlyOwnerOrGuardian');
		gateway.pause();
		vm.prank(address(0));
		vm.expectRevert('OnlyOwnerOrGuardian');
		gateway.freezeSettlement();
	}

	/* ==================================================================================== P2 */

	function testFuzz_P2_settlementIsAggregatorOnly(address caller) public {
		vm.assume(caller != aggregator && caller != address(proxyAdmin));
		bytes32 id = _create(alice, 1_000_000, 0, address(0), refundTo);

		vm.startPrank(caller);
		vm.expectRevert('OnlyAggregator');
		gateway.settleOut(bytes32(0), id, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('OnlyAggregator');
		gateway.refund(0, id);
		vm.expectRevert('OnlyAggregator');
		gateway.setPayees(id, _payees());
		vm.stopPrank();
	}

	/* ==================================================================================== P3 */

	function test_P3_initialization() public {
		vm.expectRevert('Initializable: contract is already initialized');
		impl.initialize();
		vm.expectRevert('Initializable: contract is already initialized');
		gateway.initialize();

		assertEq(uint256(vm.load(address(gateway), bytes32(uint256(151)))), MAX_BPS, 'MAX_BPS');
		assertEq(gateway.owner(), owner);
		assertFalse(gateway.paused());
	}

	/* ==================================================================================== P4 */

	function testFuzz_P4_createOrderPullsAndRecords(uint256 amount, uint256 senderFee, uint256 ptt) public {
		amount = bound(amount, 1, 1e36);
		senderFee = bound(senderFee, 0, 1e36);
		ptt = bound(ptt, 0, MAX_BPS);
		_setFees(0, ptt);
		_fund(alice, amount + senderFee);

		vm.prank(alice);
		bytes32 id = gateway.createOrder(address(token), amount, 1500, feeRecipient, senderFee, refundTo, 'msg');

		assertEq(_bal(alice), 0, 'pulled amount + senderFee');
		assertEq(_bal(address(gateway)), amount + senderFee, 'held amount + senderFee');
		IGateway.Order memory o = _order(id);
		assertEq(o.sender, alice);
		assertEq(o.token, address(token));
		assertEq(o.amount, amount);
		assertEq(o.senderFee, senderFee);
		assertEq(o.senderFeeRecipient, feeRecipient);
		assertEq(o.refundAddress, refundTo);
		assertEq(uint256(o.currentBPS), MAX_BPS);
		assertEq(o.protocolFee, (amount * ptt) / MAX_BPS);
		assertFalse(o.isFulfilled);
		assertFalse(o.isRefunded);
	}

	function test_P4_createOrderRejectsBadInput() public {
		_fund(alice, 10_000_000);
		MockUSDT other = new MockUSDT();
		vm.startPrank(alice);
		vm.expectRevert('TokenNotSupported');
		gateway.createOrder(address(other), 1, 0, address(0), 0, refundTo, 'm');
		vm.expectRevert('AmountIsZero');
		gateway.createOrder(address(token), 0, 0, address(0), 0, refundTo, 'm');
		vm.expectRevert('ThrowZeroAddress');
		gateway.createOrder(address(token), 1, 0, address(0), 0, address(0), 'm');
		vm.expectRevert('InvalidSenderFeeRecipient');
		gateway.createOrder(address(token), 1, 0, address(0), 1, refundTo, 'm');
		vm.expectRevert('InvalidMessageHash');
		gateway.createOrder(address(token), 1, 0, address(0), 0, refundTo, '');
		vm.stopPrank();
	}

	/* ==================================================================================== P5 */

	function test_P5_orderIdsFollowTheSenderNonce() public {
		bytes32 a1 = _create(alice, 10, 0, address(0), refundTo);
		bytes32 a2 = _create(alice, 10, 0, address(0), refundTo);
		bytes32 b1 = _create(bob, 10, 0, address(0), refundTo);
		assertEq(a1, _orderId(alice, 1));
		assertEq(a2, _orderId(alice, 2));
		assertEq(b1, _orderId(bob, 1));
		assertTrue(a1 != a2 && a1 != b1 && a2 != b1);
	}

	/// `createOrder` never overwrites an existing record. The record is written straight into storage here (the
	/// `order` mapping is slot 255, `sender` is the struct's first word); it must survive the call, and the sender's
	/// funds and nonce stay where they were.
	function test_P5_createOrderNeverOverwritesAnExistingRecord() public {
		bytes32 id = _orderId(alice, 1);
		address holder = address(uint160(0x5107));
		vm.store(address(gateway), keccak256(abi.encode(id, uint256(255))), bytes32(uint256(uint160(holder))));
		assertEq(_order(id).sender, holder);

		_fund(alice, 10);
		vm.prank(alice);
		vm.expectRevert('OrderAlreadyExists');
		gateway.createOrder(address(token), 10, 1500, address(0), 0, refundTo, 'msg');

		assertEq(_order(id).sender, holder);
		assertEq(_bal(alice), 10);
		assertEq(uint256(vm.load(address(gateway), keccak256(abi.encode(alice, uint256(256))))), 0, 'nonce unchanged');
	}

	/// `settleIn` on a predicted `createOrder` id does not block `createOrder`.
	function test_P5_settleInDoesNotBlockCreateOrder() public {
		bytes32 predictedId = _orderId(alice, 1);
		_fund(provider, 1);
		vm.prank(provider);
		assertTrue(gateway.settleIn(predictedId, address(token), 1, address(0), 0, provider, 0, 0));

		IGateway.Order memory settleInOrder = _order(predictedId);
		assertEq(settleInOrder.sender, provider);
		assertTrue(settleInOrder.isFulfilled);

		_fund(provider, 1);
		vm.prank(provider);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(predictedId, address(token), 1, address(0), 0, provider, 0, 0);

		bytes32 createdId = _create(alice, 100e6, 0, address(0), refundTo);
		assertEq(createdId, predictedId);
		IGateway.Order memory o = _order(createdId);
		assertEq(o.sender, alice);
		assertEq(o.amount, 100e6);
		assertFalse(o.isFulfilled);

		assertTrue(_settleOut(createdId, provider, uint64(MAX_BPS), 0));
		o = _order(createdId);
		assertTrue(o.isFulfilled);
		assertEq(o.amount, 0);
	}

	/* ==================================================================================== P6 */

	function testFuzz_P6_fullSettlementPaysExactly(
		uint256 amount,
		uint256 senderFee,
		uint256 stt,
		uint256 ptt,
		uint256 seed
	) public {
		amount = bound(amount, 1, 1e36);
		senderFee = bound(senderFee, 0, 1e36);
		_setFees(bound(stt, 0, MAX_BPS), bound(ptt, 0, MAX_BPS));
		bytes32 id = _create(alice, amount, senderFee, feeRecipient, refundTo);

		uint256 splits = bound(seed, 1, 4);
		uint256 remainingBps = MAX_BPS;
		for (uint256 i; i < splits; i++) {
			uint256 r = uint256(keccak256(abi.encode(seed, i)));
			uint64 pct = i + 1 == splits
				? uint64(remainingBps)
				: uint64(bound(r, 1, remainingBps - (splits - 1 - i)));
			uint64 rebate = uint64(bound(r >> 128, 0, MAX_BPS));
			assertTrue(_settleOut(id, i % 2 == 0 ? provider : provider2, pct, rebate));
			remainingBps -= pct;
			if (i + 1 < splits) assertEq(_bal(feeRecipient), 0, 'sender fee only on the last split');
		}

		uint256 out = _bal(provider) + _bal(provider2) + _bal(treasury) + _bal(feeRecipient);
		assertEq(out, amount + senderFee, 'paid out exactly what the order held');
		assertEq(_bal(address(gateway)), 0, 'nothing left');
		IGateway.Order memory o = _order(id);
		assertTrue(o.isFulfilled);
		assertEq(o.amount, 0);
		assertEq(uint256(o.currentBPS), 0);
	}

	/* ==================================================================================== P7 */

	function testFuzz_P7_splitMath(uint256 amount, uint256 ptt, uint64 pct, uint64 rebate) public {
		amount = bound(amount, 1, 1e36);
		ptt = bound(ptt, 0, MAX_BPS);
		pct = uint64(bound(pct, 1, MAX_BPS));
		rebate = uint64(bound(rebate, 0, MAX_BPS));
		_setFees(0, ptt);
		bytes32 id = _create(alice, amount, 0, address(0), refundTo);

		_settleOut(id, provider, pct, rebate);

		uint256 gross = (amount * pct) / MAX_BPS;
		uint256 fee = (gross * ptt) / MAX_BPS;
		uint256 reb = (fee * rebate) / MAX_BPS;
		assertEq(_bal(provider), gross - fee + reb, 'provider');
		assertEq(_bal(treasury), fee - reb, 'treasury');
		assertLe(reb, fee, 'rebate within the treasury fee');
		assertEq(_order(id).amount, amount - gross, 'remaining drops by the gross');
		assertEq(uint256(_order(id).currentBPS), MAX_BPS - pct);
	}

	function test_P7_tinySplitCarriesNoTreasuryFee() public {
		_setFees(0, 1); // 0.001%: a 1-unit split rounds the fee to zero
		bytes32 id = _create(alice, 1, 0, address(0), refundTo);
		_settleOut(id, provider, uint64(MAX_BPS), 0);
		assertEq(_bal(provider), 1);
		assertEq(_bal(treasury), 0);
	}

	function test_P7_rebateAboveTheOwnerCapReverts() public {
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		vm.expectEmit(false, false, false, true, address(gateway));
		emit MaxRebatePercentUpdated(50_000);
		gateway.setMaxRebatePercent(50_000);
		assertEq(gateway.getMaxRebatePercent(), 50_000);
		vm.prank(aggregator);
		vm.expectRevert('InvalidRebatePercent');
		gateway.settleOut(bytes32(0), id, provider, uint64(MAX_BPS), 50_001, _payees());
		assertTrue(_settleOut(id, provider, uint64(MAX_BPS), 50_000), 'at the cap is allowed');
	}

	function test_P7_zeroCapAllowsOnlyZeroRebate() public {
		gateway.setMaxRebatePercent(0);
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		vm.prank(aggregator);
		vm.expectRevert('InvalidRebatePercent');
		gateway.settleOut(bytes32(0), id, provider, uint64(MAX_BPS), 1, _payees());
		assertTrue(_settleOut(id, provider, uint64(MAX_BPS), 0));
	}

	function test_P7_rebateAboveMaxReverts() public {
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		vm.prank(aggregator);
		vm.expectRevert('InvalidRebatePercent');
		gateway.settleOut(bytes32(0), id, provider, uint64(MAX_BPS), uint64(MAX_BPS + 1), _payees());
	}

	/* ==================================================================================== P8 */

	function test_P8_fulfilledOrderIsFinal() public {
		bytes32 id = _create(alice, 1000, 10, feeRecipient, refundTo);
		_settleOut(id, provider, uint64(MAX_BPS), 0);

		vm.startPrank(aggregator);
		vm.expectRevert('OrderFulfilled');
		gateway.settleOut(bytes32(0), id, provider, 1, 0, _payees());
		vm.expectRevert('OrderFulfilled');
		gateway.refund(0, id);
		vm.stopPrank();
	}

	function test_P8_refundedOrderIsFinal() public {
		bytes32 id = _create(alice, 1000, 10, feeRecipient, refundTo);
		_refund(id, 0);

		vm.startPrank(aggregator);
		vm.expectRevert('OrderRefunded');
		gateway.settleOut(bytes32(0), id, provider, 1, 0, _payees());
		vm.expectRevert('OrderRefunded');
		gateway.refund(0, id);
		vm.stopPrank();
	}

	function testFuzz_P8_splitBeyondRemainingReverts(uint64 first, uint64 second) public {
		first = uint64(bound(first, 1, MAX_BPS - 1));
		second = uint64(bound(second, MAX_BPS - first + 1, type(uint64).max));
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		_settleOut(id, provider, first, 0);

		vm.startPrank(aggregator);
		vm.expectRevert('InvalidSettlePercent');
		gateway.settleOut(bytes32(0), id, provider, second, 0, _payees());
		vm.expectRevert('InvalidSettlePercent');
		gateway.settleOut(bytes32(0), id, provider, 0, 0, _payees());
		vm.stopPrank();
	}

	function testFuzz_P8_unknownOrderCannotSettleOrRefund(bytes32 id, uint64 pct) public {
		_create(alice, 1000, 0, address(0), refundTo); // the Gateway holds tokens
		vm.assume(id != _orderId(alice, 1));
		vm.startPrank(aggregator);
		vm.expectRevert('PayeesNotSet');
		gateway.settleOut(bytes32(0), id, provider, pct, 0, _payees());
		vm.expectRevert('OrderNotFound');
		gateway.setPayees(id, _payees());
		vm.expectRevert(); // token address(0): the transfer has no contract to call
		gateway.refund(0, id);
		vm.stopPrank();
	}

	/* ==================================================================================== P9 */

	function testFuzz_P9_refundPaysWhatTheOrderHolds(
		uint256 amount,
		uint256 senderFee,
		uint256 ptt,
		uint256 fee,
		uint64 partialPct
	) public {
		amount = bound(amount, 1, 1e36);
		senderFee = bound(senderFee, 0, 1e36);
		ptt = bound(ptt, 0, MAX_BPS);
		partialPct = uint64(bound(partialPct, 0, MAX_BPS - 1));
		_setFees(0, ptt);
		bytes32 id = _create(alice, amount, senderFee, feeRecipient, refundTo);
		if (partialPct > 0) _settleOut(id, provider, partialPct, 0);

		IGateway.Order memory before = _order(id);
		uint256 cap = before.protocolFee < before.amount ? before.protocolFee : before.amount;
		fee = bound(fee, 0, cap);
		uint256 treasuryBefore = _bal(treasury);

		assertTrue(_refund(id, fee));

		assertEq(_bal(treasury) - treasuryBefore, fee, 'treasury gets the refund fee');
		assertEq(_bal(refundTo), before.amount - fee + senderFee, 'refund address gets the rest and the sender fee');
		assertEq(_bal(address(gateway)), 0, 'nothing left');
		IGateway.Order memory o = _order(id);
		assertTrue(o.isRefunded);
		assertEq(uint256(o.currentBPS), 0);
	}

	function test_P9_feeAboveProtocolFeeReverts() public {
		_setFees(0, 1000); // 1%
		bytes32 id = _create(alice, 10_000, 0, address(0), refundTo); // protocolFee 100
		vm.prank(aggregator);
		vm.expectRevert('FeeExceedsProtocolFee');
		gateway.refund(101, id);
		assertTrue(_refund(id, 100));
	}

	/* ==================================================================================== P10 */

	function testFuzz_P10_settleInPassesEverythingThrough(
		uint256 amount,
		uint96 senderFee,
		uint256 stt,
		uint256 ptt,
		uint64 rebate,
		bytes32 id
	) public {
		amount = bound(amount, 1, 1e36);
		stt = bound(stt, 0, MAX_BPS);
		ptt = bound(ptt, 0, MAX_BPS);
		rebate = uint64(bound(rebate, 0, MAX_BPS));
		_setFees(stt, ptt);
		_fund(provider, amount + senderFee);
		uint256 held = _bal(address(gateway));

		vm.prank(provider);
		assertTrue(
			gateway.settleIn(id, address(token), amount, feeRecipient, senderFee, recipient, 1500, rebate)
		);

		uint256 gross = (amount * ptt) / MAX_BPS;
		uint256 reb = (gross * rebate) / MAX_BPS;
		uint256 feeTreasury = senderFee - _feeToRecipient(senderFee, stt);
		assertEq(_bal(address(gateway)), held, 'nothing stays in the Gateway');
		assertEq(_bal(recipient), amount - gross, 'recipient');
		assertEq(_bal(provider), reb, 'rebate back to the provider');
		assertEq(_bal(treasury), gross - reb + feeTreasury, 'treasury');
		assertEq(_bal(feeRecipient), _feeToRecipient(senderFee, stt), 'sender fee recipient');

		IGateway.Order memory o = _order(id);
		assertEq(o.sender, recipient);
		assertTrue(o.isFulfilled);
		assertEq(o.amount, amount - gross);
		assertEq(o.protocolFee, gross);
	}

	function test_P10_settleInRejectsUsedIdsAndBadRebates() public {
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		_fund(provider, 10_000);
		vm.startPrank(provider);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(id, address(token), 10, address(0), 0, recipient, 1, 0);
		vm.expectRevert('InvalidRebatePercent');
		gateway.settleIn(bytes32(uint256(7)), address(token), 10, address(0), 0, recipient, 1, uint64(MAX_BPS + 1));
		gateway.settleIn(bytes32(uint256(7)), address(token), 10, address(0), 0, recipient, 1, 0);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(bytes32(uint256(7)), address(token), 10, address(0), 0, recipient, 1, 0);
		vm.stopPrank();
	}

	function test_P10_settleInSmallAmountCarriesNoTreasuryFee() public {
		_setFees(0, 10); // 0.01%: below 10_000 units the fee rounds to zero
		_fund(provider, 100);
		vm.prank(provider);
		gateway.settleIn(bytes32(uint256(9)), address(token), 100, address(0), 0, recipient, 1, uint64(MAX_BPS));
		assertEq(_bal(recipient), 100);
		assertEq(_bal(treasury), 0);
		assertEq(_bal(provider), 0);
	}

	/* ==================================================================================== P11 */

	function testFuzz_P11_senderFeeSplit(uint96 fee, uint256 stt) public {
		stt = bound(stt, 0, MAX_BPS);
		_setFees(stt, 0);
		bytes32 id = _create(alice, 1, fee, feeRecipient, refundTo);
		_settleOut(id, provider, uint64(MAX_BPS), 0);
		assertEq(_bal(feeRecipient), _feeToRecipient(fee, stt));
		assertEq(_bal(feeRecipient) + _bal(treasury), fee, 'recipient and treasury share exactly the fee');
	}

	function test_P11_allOfTheSenderFeeToTreasury() public {
		_setFees(MAX_BPS, 0);
		bytes32 id = _create(alice, 1, 500, feeRecipient, refundTo);
		_settleOut(id, provider, uint64(MAX_BPS), 0);
		assertEq(_bal(feeRecipient), 0);
		assertEq(_bal(treasury), 500);
	}

	/* ==================================================================================== P13 */

	function test_P13_pauseStopsMoneyInButNotSettlement() public {
		bytes32 a = _create(alice, 1000, 0, address(0), refundTo);
		bytes32 b = _create(bob, 1000, 0, address(0), refundTo);
		_fund(alice, 1000);
		_fund(provider, 1000);
		gateway.pause();

		vm.prank(alice);
		vm.expectRevert('Pausable: paused');
		gateway.createOrder(address(token), 1, 0, address(0), 0, refundTo, 'm');
		vm.prank(provider);
		vm.expectRevert('Pausable: paused');
		gateway.settleIn(bytes32(uint256(5)), address(token), 1, address(0), 0, recipient, 1, 0);

		assertTrue(_settleOut(a, provider, uint64(MAX_BPS), 0), 'open orders still settle');
		assertTrue(_refund(b, 0), 'open orders still refund');

		gateway.unpause();
		vm.prank(alice);
		gateway.createOrder(address(token), 1, 0, address(0), 0, refundTo, 'm');
	}

	/* ==================================================================================== P14 */

	function test_P14_feeSettingBounds() public {
		vm.expectRevert('Gateway: invalid sender to treasury');
		gateway.setTokenFeeSettings(address(token), MAX_BPS + 1, 0);
		vm.expectRevert('Gateway: invalid provider to treasury');
		gateway.setTokenFeeSettings(address(token), 0, MAX_BPS + 1);
		vm.expectRevert('Gateway: token not supported');
		gateway.setTokenFeeSettings(address(0x1234), 0, 0);

		gateway.setTokenFeeSettings(address(token), MAX_BPS, MAX_BPS);
		Gateway.TokenFeeSettings memory s = gateway.getTokenFeeSettings(address(token));
		assertEq(s.senderToTreasury, MAX_BPS);
		assertEq(s.providerToTreasury, MAX_BPS);
		assertEq(s.senderToProvider, 0);
		assertEq(s.providerToAggregator, 0);
	}

	function test_P14_maxRebatePercentBound() public {
		vm.expectRevert('Gateway: invalid max rebate percent');
		gateway.setMaxRebatePercent(uint64(MAX_BPS + 1));
		gateway.setMaxRebatePercent(uint64(MAX_BPS));
		assertEq(gateway.getMaxRebatePercent(), MAX_BPS);
	}

	function test_P14_addressAndStatusChecks() public {
		vm.expectRevert('Gateway: zero address');
		gateway.settingManagerBool('token', address(0), 1);
		vm.expectRevert('Gateway: invalid status');
		gateway.settingManagerBool('token', address(token), 0);
		vm.expectRevert('Gateway: invalid status');
		gateway.settingManagerBool('token', address(token), 3);
		vm.expectRevert('Gateway: zero address');
		gateway.updateProtocolAddress('treasury', address(0));
		vm.expectRevert('Gateway: treasury address already set');
		gateway.updateProtocolAddress('treasury', treasury);
		vm.expectRevert('Gateway: aggregator address already set');
		gateway.updateProtocolAddress('aggregator', aggregator);

		gateway.updateProtocolAddress('aggregator', address(0xA67));
		assertEq(gateway.getAggregator(), address(0xA67));
	}

	function test_P14_unknownSettingKeysChangeNothing() public {
		address other = address(0x0DD);
		gateway.settingManagerBool('nope', other, 1);
		assertFalse(gateway.isTokenSupported(other));
		gateway.updateProtocolAddress('nope', other);
		assertEq(gateway.getAggregator(), aggregator);
		assertEq(address(uint160(uint256(vm.load(address(gateway), bytes32(uint256(152)))) >> 64)), treasury);
	}

	/* ==================================================================================== P15 */

	function test_P15_delistingDoesNotStrandOpenOrders() public {
		bytes32 a = _create(alice, 1000, 5, feeRecipient, refundTo);
		bytes32 b = _create(bob, 1000, 5, feeRecipient, refundTo);
		gateway.settingManagerBool('token', address(token), 2);
		assertFalse(gateway.isTokenSupported(address(token)));

		_fund(alice, 1000);
		_fund(provider, 1000);
		vm.prank(alice);
		vm.expectRevert('TokenNotSupported');
		gateway.createOrder(address(token), 1, 0, address(0), 0, refundTo, 'm');
		vm.prank(provider);
		vm.expectRevert('TokenNotSupported');
		gateway.settleIn(bytes32(uint256(5)), address(token), 1, address(0), 0, recipient, 1, 0);

		assertTrue(_settleOut(a, provider, uint64(MAX_BPS), 0));
		assertTrue(_refund(b, 0));
		assertEq(_bal(address(gateway)), 0);
	}

	/* ==================================================================================== P16 */

	/// Pins the slots recorded for every deployed implementation in .openzeppelin/*.json (see
	/// scripts/check-gateway-storage-layout.py for the manifest comparison itself).
	function test_P16_storageSlotsMatchTheDeployedLayout() public {
		address g = address(gateway);
		_setFees(123, 456);
		bytes32 id = _create(alice, 1000, 7, feeRecipient, refundTo);
		gateway.transferOwnership(bob);
		gateway.pause();

		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(51)))))), owner, '_owner @51');
		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(101)))))), bob, '_pendingOwner @101');
		assertEq(uint256(vm.load(g, bytes32(uint256(151)))), MAX_BPS, 'MAX_BPS @151');
		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(152)))) >> 64)), treasury, 'treasury @152+8');
		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(153)))))), aggregator, 'aggregator @153');
		assertEq(uint256(vm.load(g, keccak256(abi.encode(address(token), uint256(154))))), 1, 'isTokenSupported @154');
		bytes32 fees = keccak256(abi.encode(address(token), uint256(155)));
		assertEq(uint256(vm.load(g, bytes32(uint256(fees) + 2))), 123, 'senderToTreasury @155[.2]');
		assertEq(uint256(vm.load(g, bytes32(uint256(fees) + 3))), 456, 'providerToTreasury @155[.3]');
		assertEq(uint256(vm.load(g, bytes32(uint256(205)))) & 0xff, 1, '_paused @205');

		bytes32 o = keccak256(abi.encode(id, uint256(255)));
		assertEq(address(uint160(uint256(vm.load(g, o)))), alice, 'order.sender');
		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(o) + 1))))), address(token), 'order.token');
		assertEq(uint256(vm.load(g, bytes32(uint256(o) + 3))), 7, 'order.senderFee');
		assertEq(address(uint160(uint256(vm.load(g, bytes32(uint256(o) + 5))) >> 16)), refundTo, 'order.refundAddress');
		assertEq(uint256(vm.load(g, bytes32(uint256(o) + 6))), MAX_BPS, 'order.currentBPS');
		assertEq(uint256(vm.load(g, bytes32(uint256(o) + 7))), 1000, 'order.amount');
		assertEq(uint256(vm.load(g, keccak256(abi.encode(alice, uint256(256))))), 1, '_nonce @256');
	}

	/// The variables this change appends: two from the GatewaySettingManager gap, two from the Gateway gap.
	function test_P16_newVariablesTakeTheStartOfTheirGaps() public {
		address g = address(gateway);
		address guardian = address(uint160(0x6A2D));
		gateway.setGuardian(guardian);
		gateway.setMaxRebatePercent(12_345);
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		gateway.freezeSettlement();

		uint256 packed = uint256(vm.load(g, bytes32(uint256(156))));
		assertEq(address(uint160(packed)), guardian, '_guardian @156');
		assertEq(uint64(packed >> 160), 12_345, '_maxRebatePercent @156+20');
		assertEq(vm.load(g, keccak256(abi.encode(id, uint256(257)))), keccak256(abi.encode(_payees())), '_payeesHash @257');
		assertEq(uint256(vm.load(g, bytes32(uint256(258)))) & 0xff, 1, '_settlementFrozen @258');
		assertEq(uint256(vm.load(g, bytes32(uint256(205)))) & 0xff, 0, '_paused @205 untouched');
	}

	/* ==================================================================================== P17 */

	function _key(bytes32 id) internal pure returns (bytes32) {
		return keccak256(abi.encode('SETTLE_IN', id));
	}

	function _rawSlot(bytes32 id) internal pure returns (bytes32) {
		return keccak256(abi.encode(id, uint256(255)));
	}

	function _rawSender(bytes32 id) internal view returns (address) {
		return address(uint160(uint256(vm.load(address(gateway), _rawSlot(id)))));
	}

	function _storeLegacySettleIn(bytes32 id, address to, uint256 amount) internal {
		bytes32 o = _rawSlot(id);
		vm.store(address(gateway), o, bytes32(uint256(uint160(to))));
		vm.store(address(gateway), bytes32(uint256(o) + 1), bytes32(uint256(uint160(address(token)))));
		vm.store(address(gateway), bytes32(uint256(o) + 5), bytes32(uint256(1)));
		vm.store(address(gateway), bytes32(uint256(o) + 7), bytes32(amount));
	}

	/// Regression for the settleIn id-squatting report: a third party settles in for 1 unit, paid back to itself, at
	/// the victim's next createOrder id. The victim's createOrder still gets exactly that id (P5), and the next one.
	function test_P17_settleInCannotBlockTheNextCreateOrder() public {
		address attacker = address(uint160(0xBAD));
		address victim = address(uint160(0x71C71));
		bytes32 next = keccak256(abi.encode(victim, uint256(1), block.chainid));
		_fund(attacker, 1);
		vm.prank(attacker);
		gateway.settleIn(next, address(token), 1, address(0), 0, attacker, 1, 0);

		_fund(victim, 2_000_000);
		vm.startPrank(victim);
		bytes32 first = gateway.createOrder(address(token), 1_000_000, 1500, address(0), 0, victim, 'msg');
		bytes32 second = gateway.createOrder(address(token), 1_000_000, 1500, address(0), 0, victim, 'msg');
		vm.stopPrank();
		assertEq(first, next);
		assertEq(second, _orderId(victim, 2));
		assertEq(_order(first).sender, victim);
		assertEq(_order(first).amount, 1_000_000);
		assertEq(_order(_key(next)).sender, attacker, 'settleIn record kept apart at the key');
	}

	function testFuzz_P17_settleInNeverBlocksCreateOrder(
		address caller,
		address sender,
		uint8 prior,
		bytes32 id,
		bool targetNext
	) public {
		vm.assume(caller != address(0) && sender != address(0));
		vm.assume(caller != address(proxyAdmin) && sender != address(proxyAdmin));
		vm.assume(caller != address(gateway) && sender != address(gateway));
		prior = uint8(bound(prior, 0, 3));
		for (uint256 i; i < prior; i++) _create(sender, 10, 0, address(0), refundTo);
		bytes32 next = _orderId(sender, uint256(prior) + 1);
		if (targetNext) id = next;
		_fund(caller, 1);
		vm.prank(caller);
		gateway.settleIn(id, address(token), 1, address(0), 0, caller, 1, 0);
		assertEq(_create(sender, 10, 0, address(0), refundTo), next);
		assertEq(_order(next).sender, sender);
	}

	/// The settleIn key is a 128-byte preimage ('SETTLE_IN' is ABI-encoded as a dynamic string), a createOrder id a
	/// 96-byte one, so no key is any (sender, nonce, chain id); and the Gateway books a settleIn order at that key.
	function testFuzz_P17_settleInKeyIsNeverACreateOrderId(bytes32 id, address sender, uint256 nonce, uint64 chainId) public {
		vm.chainId(chainId);
		assertTrue(_key(id) != keccak256(abi.encode(sender, nonce, block.chainid)));
		assertEq(abi.encode('SETTLE_IN', id).length, 128);
		_fund(provider, 1);
		vm.prank(provider);
		gateway.settleIn(id, address(token), 1, address(0), 0, recipient, 1, 0);
		assertEq(_order(_key(id)).sender, recipient, 'booked at the key');
		assertEq(_rawSender(id), address(0), 'raw slot untouched');
	}

	function test_P17_settleInBooksUnderItsKeyAndEmitsTheRawId() public {
		_setFees(20_000, 1000);
		bytes32 id = keccak256('onramp-1');
		bytes32 key = _key(id);
		_fund(provider, 2 * (10_000 + 50));
		vm.expectEmit(address(gateway));
		emit SenderFeeTransferred(id, feeRecipient, 40);
		vm.expectEmit(address(gateway));
		emit TransferFeeSplit(id, 40, 10);
		vm.expectEmit(address(gateway));
		emit SettleIn(id, provider, recipient, 9_900, address(token), 100, 1500, 50_000);
		vm.prank(provider);
		gateway.settleIn(id, address(token), 10_000, feeRecipient, 50, recipient, 1500, 50_000);

		assertEq(_bal(recipient), 9_900);
		assertEq(_bal(provider), 2 * (10_000 + 50) - (10_000 + 50) + 50);
		assertEq(_bal(treasury), 50 + 10);
		assertEq(_bal(feeRecipient), 40);

		IGateway.Order memory o = gateway.getOrderInfo(id); // fallback read path
		assertEq(o.sender, recipient);
		assertEq(o.token, address(token));
		assertEq(o.senderFeeRecipient, feeRecipient);
		assertEq(o.senderFee, 50);
		assertEq(o.protocolFee, 100);
		assertTrue(o.isFulfilled);
		assertEq(o.refundAddress, address(0));
		assertEq(o.amount, 9_900);
		assertEq(keccak256(abi.encode(_order(key))), keccak256(abi.encode(o)), 'at the key');
		for (uint256 i; i < 8; i++) {
			assertEq(vm.load(address(gateway), bytes32(uint256(_rawSlot(id)) + i)), bytes32(0), 'raw slot untouched');
		}
		vm.prank(provider);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(id, address(token), 10_000, feeRecipient, 50, recipient, 1500, 0);
	}

	function test_P17_legacySettleInIdStaysUsed() public {
		bytes32 id = keccak256('legacy-onramp');
		_storeLegacySettleIn(id, recipient, 777);
		IGateway.Order memory o = gateway.getOrderInfo(id);
		assertEq(o.sender, recipient);
		assertEq(o.token, address(token));
		assertTrue(o.isFulfilled);
		assertEq(o.amount, 777);
		_fund(provider, 10);
		vm.prank(provider);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(id, address(token), 10, address(0), 0, recipient, 1, 0);
		assertEq(_order(_key(id)).sender, address(0), 'nothing booked at the key');
		assertEq(_bal(provider), 10);
	}

	/// getOrderInfo returns the createOrder record (the raw slot wins), an unused id is empty, and a createOrder id
	/// cannot then be settled in.
	function test_P17_getOrderInfoPrefersCreateOrderRecords() public {
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		assertEq(gateway.getOrderInfo(id).sender, alice);
		assertEq(gateway.getOrderInfo(keccak256('unused')).sender, address(0));
		_fund(provider, 10);
		vm.prank(provider);
		vm.expectRevert('OrderAlreadyExists');
		gateway.settleIn(id, address(token), 10, address(0), 0, recipient, 1, 0);
	}

	function test_P17_settleInOrdersCannotBeSettledOrRefunded() public {
		bytes32 open = _create(alice, 1000, 10, feeRecipient, refundTo);
		bytes32 id = keccak256('onramp-2');
		_fund(provider, 500);
		vm.prank(provider);
		gateway.settleIn(id, address(token), 500, address(0), 0, recipient, 1, 0);
		bytes32 key = _key(id);
		bytes32 legacy = keccak256('legacy-onramp');
		_storeLegacySettleIn(legacy, recipient, 500);
		uint256 held = _bal(address(gateway));
		assertEq(held, 1010);

		vm.startPrank(aggregator);
		vm.expectRevert('PayeesNotSet');
		gateway.settleOut(bytes32(0), id, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('OrderNotFound');
		gateway.setPayees(id, _payees());
		vm.expectRevert('OrderFulfilled');
		gateway.setPayees(key, _payees());
		vm.expectRevert('OrderFulfilled');
		gateway.setPayees(legacy, _payees());
		vm.expectRevert('FeeExceedsProtocolFee');
		gateway.refund(1, id);
		vm.expectRevert();
		gateway.refund(0, id);
		vm.expectRevert('OrderFulfilled');
		gateway.settleOut(bytes32(0), key, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('OrderFulfilled');
		gateway.refund(0, key);
		vm.expectRevert('OrderFulfilled');
		gateway.settleOut(bytes32(0), legacy, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('OrderFulfilled');
		gateway.refund(0, legacy);
		vm.stopPrank();

		assertEq(_bal(address(gateway)), held, 'nothing moved');
		assertEq(_rawSender(id), address(0), 'raw slot still empty');
		assertTrue(_settleOut(open, provider, uint64(MAX_BPS), 0));
		assertEq(_bal(address(gateway)), 0);
	}

	/// Before the victim's createOrder lands, getOrderInfo(predictedId) shows the squatter's fulfilled settleIn record;
	/// after it lands, the createOrder record shadows it. Fail-safe for readers: before creation the id only ever reads as closed.
	function test_P17_getOrderInfoFallbackUntilCreateOrderShadowsIt() public {
		bytes32 next = _orderId(alice, 1);
		_fund(provider, 1);
		vm.prank(provider);
		gateway.settleIn(next, address(token), 1, address(0), 0, provider, 1, 0);
		assertTrue(gateway.getOrderInfo(next).isFulfilled, 'pre-create: squat record visible as fulfilled');
		assertEq(gateway.getOrderInfo(next).sender, provider);
		bytes32 id = _create(alice, 100, 0, address(0), refundTo);
		assertEq(id, next);
		assertFalse(gateway.getOrderInfo(next).isFulfilled, 'post-create: createOrder record wins');
		assertEq(gateway.getOrderInfo(next).sender, alice);
	}

	/// An attacker-chosen settleIn id equal to another id's key: getOrderInfo(K) then reads the other order's record
	/// (raw slot K), and settling in at Y after K is booked still works; the reverse order blocks K.
	function test_P17_getOrderInfoRawSlotWinsForAnIdEqualToAnotherKey() public {
		bytes32 y = keccak256('onramp-y');
		bytes32 k = _key(y);
		_fund(provider, 2);
		vm.startPrank(provider);
		gateway.settleIn(k, address(token), 1, address(0), 0, address(0xAAA1), 1, 0);
		gateway.settleIn(y, address(token), 1, address(0), 0, address(0xBBB2), 1, 0);
		vm.stopPrank();
		assertEq(gateway.getOrderInfo(y).sender, address(0xBBB2));
		assertEq(gateway.getOrderInfo(k).sender, address(0xBBB2), 'K reads Y record, not the one settled in as K');
	}

	/// No settleIn record, by raw id or key, ever makes getOrderInfo(createOrderId) fulfilled once created.
	function testFuzz_P17_createdOrderNeverReadsAsFulfilledFromSettleIn(bytes32 id, bool targetNext) public {
		bytes32 next = _orderId(alice, 1);
		if (targetNext) id = next;
		_fund(provider, 1);
		vm.prank(provider);
		gateway.settleIn(id, address(token), 1, address(0), 0, provider, 1, 0);
		bytes32 created = _create(alice, 100, 0, address(0), refundTo);
		IGateway.Order memory o = gateway.getOrderInfo(created);
		assertEq(o.sender, alice);
		assertFalse(o.isFulfilled);
		assertEq(o.amount, 100);
	}

	/* ==================================================================================== P18 */

	function test_P18_freezeStopsSettlementRefundAndBinding() public {
		bytes32 a = _create(alice, 1000, 0, address(0), refundTo);
		_fund(bob, 1000);
		vm.prank(bob);
		bytes32 b = gateway.createOrder(address(token), 1000, 1500, address(0), 0, refundTo, 'msg');
		uint256 held = _bal(address(gateway));
		gateway.freezeSettlement();

		vm.startPrank(aggregator);
		vm.expectRevert('SettlementFrozen');
		gateway.settleOut(bytes32(0), a, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('SettlementFrozen');
		gateway.refund(0, a);
		vm.expectRevert('SettlementFrozen');
		gateway.setPayees(b, _payees());
		vm.stopPrank();
		vm.expectRevert('SettlementFrozen');
		gateway.freezeSettlement();
		assertEq(_bal(address(gateway)), held, 'nothing moved');

		// A freeze does not stop money in: that is the pause (P13).
		_create(alice, 10, 0, address(0), refundTo);

		gateway.unfreezeSettlement();
		vm.expectRevert('SettlementNotFrozen');
		gateway.unfreezeSettlement();
		assertTrue(_settleOut(a, provider, uint64(MAX_BPS), 0));
		vm.prank(aggregator);
		assertTrue(gateway.setPayees(b, _payees()));
		assertTrue(_refund(b, 0));
	}

	/* ==================================================================================== P19 */

	function _payeesOf(address a, address b) internal pure returns (address[] memory list) {
		list = new address[](2);
		list[0] = a;
		list[1] = b;
	}

	function test_P19_createOrderWithPayeesBindsTheList() public {
		_fund(alice, 1000);
		bytes32 expected = _orderId(alice, 1);
		vm.expectEmit(true, false, false, true, address(gateway));
		emit OrderPayeesSet(expected, _payees());
		vm.prank(alice);
		bytes32 id = gateway.createOrderWithPayees(address(token), 1000, 1500, address(0), 0, refundTo, 'msg', _payees());
		assertEq(id, expected);
		assertEq(gateway.getOrderPayeesHash(id), keccak256(abi.encode(_payees())));
		assertEq(_bal(address(gateway)), 1000);

		vm.prank(aggregator);
		vm.expectRevert('PayeesAlreadySet');
		gateway.setPayees(id, _payeesOf(provider, bob));
	}

	function test_P19_createOrderWithPayeesRejectsBadLists() public {
		_fund(alice, 10);
		address[] memory empty = new address[](0);
		address[] memory tooMany = new address[](gateway.MAX_PAYEES() + 1);
		for (uint256 i; i < tooMany.length; i++) tooMany[i] = address(uint160(0x1000 + i));
		address[] memory withZero = _payeesOf(provider, address(0));

		vm.startPrank(alice);
		vm.expectRevert('InvalidPayees');
		gateway.createOrderWithPayees(address(token), 1, 0, address(0), 0, refundTo, 'm', empty);
		vm.expectRevert('InvalidPayees');
		gateway.createOrderWithPayees(address(token), 1, 0, address(0), 0, refundTo, 'm', tooMany);
		vm.expectRevert('InvalidPayees');
		gateway.createOrderWithPayees(address(token), 1, 0, address(0), 0, refundTo, 'm', withZero);
		// The createOrder checks still apply (P4).
		vm.expectRevert('AmountIsZero');
		gateway.createOrderWithPayees(address(token), 0, 0, address(0), 0, refundTo, 'm', _payees());
		vm.stopPrank();

		// MAX_PAYEES itself is accepted.
		address[] memory full = new address[](gateway.MAX_PAYEES());
		for (uint256 i; i < full.length; i++) full[i] = address(uint160(0x1000 + i));
		vm.prank(alice);
		gateway.createOrderWithPayees(address(token), 1, 0, address(0), 0, refundTo, 'm', full);
		assertEq(_bal(address(gateway)), 1);
	}

	function test_P19_setPayeesBindsOnceOnOpenOrdersOnly() public {
		_fund(alice, 3000);
		vm.startPrank(alice);
		bytes32 a = gateway.createOrder(address(token), 1000, 1500, address(0), 0, refundTo, 'msg');
		bytes32 b = gateway.createOrder(address(token), 1000, 1500, address(0), 0, refundTo, 'msg');
		vm.stopPrank();
		assertEq(gateway.getOrderPayeesHash(a), bytes32(0), 'createOrder binds nothing');

		vm.startPrank(aggregator);
		vm.expectRevert('PayeesNotSet');
		gateway.settleOut(bytes32(0), a, provider, uint64(MAX_BPS), 0, _payees());
		vm.expectRevert('InvalidPayees');
		gateway.setPayees(a, new address[](0));

		vm.expectEmit(true, false, false, true, address(gateway));
		emit OrderPayeesSet(a, _payees());
		assertTrue(gateway.setPayees(a, _payees()));
		vm.expectRevert('PayeesAlreadySet');
		gateway.setPayees(a, _payeesOf(provider, bob));

		// A refund needs no list, and a closed order cannot be bound afterwards.
		gateway.refund(0, b);
		vm.expectRevert('OrderRefunded');
		gateway.setPayees(b, _payees());
		vm.stopPrank();

		assertTrue(_settleOut(a, provider, uint64(MAX_BPS), 0));
		assertEq(_bal(provider), 1000);
	}

	function test_P19_fulfilledOrderCannotBeBound() public {
		_fund(alice, 1000);
		vm.prank(alice);
		bytes32 a = gateway.createOrder(address(token), 1000, 1500, address(0), 0, refundTo, 'msg');
		// Pre-upgrade orders closed by settlement carry no list; binding one later is refused.
		vm.store(address(gateway), bytes32(uint256(keccak256(abi.encode(a, uint256(255)))) + 5), bytes32(uint256(1)));
		vm.prank(aggregator);
		vm.expectRevert('OrderFulfilled');
		gateway.setPayees(a, _payees());
	}

	function testFuzz_P19_settleOutPaysOnlyABoundPayee(address to, uint8 which) public {
		vm.assume(to != PAYEE_A && to != PAYEE_B && to != address(0) && to != address(gateway));
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);

		vm.startPrank(aggregator);
		vm.expectRevert('PayeeNotAllowed');
		gateway.settleOut(bytes32(0), id, to, uint64(MAX_BPS), 0, _payees());

		// Any other list, even one naming `to` or reordering the bound one, does not match.
		vm.expectRevert('PayeesMismatch');
		gateway.settleOut(bytes32(0), id, to, uint64(MAX_BPS), 0, _payeesOf(PAYEE_A, to));
		vm.expectRevert('PayeesMismatch');
		gateway.settleOut(bytes32(0), id, PAYEE_A, uint64(MAX_BPS), 0, _payeesOf(PAYEE_B, PAYEE_A));
		vm.stopPrank();

		address payee = which % 2 == 0 ? PAYEE_A : PAYEE_B;
		uint256 toBefore = _bal(to);
		assertTrue(_settleOut(id, payee, uint64(MAX_BPS), 0));
		assertEq(_bal(payee), 1000);
		assertEq(_bal(to), toBefore, 'nothing reached the stranger');
	}

	function test_P19_splitsMayPayDifferentBoundPayees() public {
		bytes32 id = _create(alice, 1000, 0, address(0), refundTo);
		assertTrue(_settleOut(id, PAYEE_A, uint64(MAX_BPS / 2), 0));
		assertTrue(_settleOut(id, PAYEE_B, uint64(MAX_BPS / 2), 0));
		assertEq(_bal(PAYEE_A), 500);
		assertEq(_bal(PAYEE_B), 500);
		assertTrue(_order(id).isFulfilled);
	}
}
