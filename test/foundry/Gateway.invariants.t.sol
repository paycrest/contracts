// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IGateway} from '../../contracts/interfaces/IGateway.sol';
import {GatewayBase} from './GatewayBase.sol';

/**
 * @dev Random-walk handler over one Gateway: creates (with and without a payee list), binds and rebinds payee lists,
 * settles in splits, refunds, settles in (onramp), changes fee settings, pauses, freezes settlement, requires
 * payees and delists. Under `fail_on_revert = false` a failed assertion inside a handler is only a
 * reverted call, so every attempt that must fail latches a violation flag if it succeeds, and the invariants read
 * the flags and ghost totals.
 */
contract GatewayHandler is GatewayBase {
	address[3] internal senders = [address(uint160(0x5E1)), address(uint160(0x5E2)), address(uint160(0x5E3))];
	address[2] internal providers = [address(uint160(0x9120)), address(uint160(0x9121))];
	address internal feeRecipient = address(uint160(0xFEE));
	address internal refundTo = address(uint160(0x2EF));
	address internal recipient = address(uint160(0x2EC1));
	// Never in a payee list: a settlement to it must always fail (P19).
	address internal stranger = address(uint160(0xBAD));

	bytes32[] public ids;
	mapping(bytes32 => bool) public payeesBound; // a payee list was bound, by the handler's own record
	mapping(bytes32 => bool) public closed; // fulfilled or refunded, by the handler's own record
	mapping(address => uint256) public senderNonces;
	bool public violationP17; // a createOrder failed with OrderAlreadyExists (a settleIn id blocked it)

	uint256 public ghostIn; // pulled into the Gateway
	uint256 public ghostOut; // paid out of the Gateway
	uint256 public ghostCreated;
	uint256 public ghostSettled;
	uint256 public ghostSplits;
	uint256 public ghostRefunded;
	uint256 public ghostSettledIn;
	bool public violationP8; // a closed order paid out again
	bool public violationP13; // money came in while paused
	bool public violationP15; // money came in for a delisted token
	bool public violationP18; // settleOut, refund or setPayees succeeded while settlement was frozen
	bool public violationP19; // an order settled without a bound list, or to an address outside it, or was rebound
	bool public violationP20; // a plain createOrder succeeded while payees were required
	uint256 public ghostBound;

	constructor() {
		setUp();
		_setFees(500, 1000);
	}

	function gateway_() external view returns (address) {
		return address(gateway);
	}

	function token_() external view returns (address) {
		return address(token);
	}

	function idsLength() external view returns (uint256) {
		return ids.length;
	}

	function _outside() internal view returns (uint256 total) {
		for (uint256 i; i < senders.length; i++) total += token.balanceOf(senders[i]);
		for (uint256 i; i < providers.length; i++) total += token.balanceOf(providers[i]);
		total += token.balanceOf(feeRecipient) + token.balanceOf(refundTo) + token.balanceOf(recipient);
		total += token.balanceOf(treasury) + token.balanceOf(stranger);
	}

	function createOrder(uint256 seed, uint256 amount, uint256 senderFee) external {
		address sender = senders[seed % senders.length];
		amount = bound(amount, 1, 1e30);
		senderFee = bound(senderFee, 0, 1e24);
		_fund(sender, amount + senderFee);
		bool paused = gateway.paused();
		bool listed = gateway.isTokenSupported(address(token));
		// Half the orders bind their payees at creation; the rest wait for bindPayees.
		bool withPayees = seed % 2 == 0;
		bool required = gateway.isPayeesRequired();
		address[] memory list = _payees();
		vm.prank(sender);
		if (withPayees) {
			try
				gateway.createOrderWithPayees(address(token), amount, 1500, feeRecipient, senderFee, refundTo, 'm', list)
			returns (bytes32 id) {
				_created(sender, id, amount + senderFee, paused, listed, true);
			} catch Error(string memory reason) {
				_createFailed(reason, paused, listed);
			} catch {}
		} else {
			try gateway.createOrder(address(token), amount, 1500, feeRecipient, senderFee, refundTo, 'm') returns (
				bytes32 id
			) {
				if (required) violationP20 = true;
				_created(sender, id, amount + senderFee, paused, listed, false);
			} catch Error(string memory reason) {
				_createFailed(reason, paused, listed);
			} catch {}
		}
	}

	function _created(address sender, bytes32 id, uint256 pulled, bool paused, bool listed, bool withPayees) internal {
		if (paused) violationP13 = true;
		if (!listed) violationP15 = true;
		senderNonces[sender]++;
		ids.push(id);
		ghostIn += pulled;
		ghostCreated++;
		if (withPayees) {
			payeesBound[id] = true;
			ghostBound++;
		}
	}

	function _createFailed(string memory reason, bool paused, bool listed) internal {
		// Funded, approved and well-formed: only a pause or a delisting may stop it, never a taken id (P17).
		if (!paused && listed && keccak256(bytes(reason)) == keccak256('OrderAlreadyExists')) violationP17 = true;
	}

	/// The payee binder binds the default list to an order created without one (P19).
	function bindPayees(uint256 seed) external {
		if (ids.length == 0) return;
		bytes32 id = ids[seed % ids.length];
		bool frozen = gateway.isSettlementFrozen();
		vm.prank(binder);
		try gateway.setPayees(id, _payees()) {
			if (frozen) violationP18 = true;
			if (payeesBound[id] || closed[id]) violationP19 = true;
			payeesBound[id] = true;
			ghostBound++;
		} catch {}
	}

	/// The owner rebinds an order's list; it may only succeed while settlement is frozen, on an open order (P19).
	function rebindPayees(uint256 seed) external {
		if (ids.length == 0) return;
		bytes32 id = ids[seed % ids.length];
		bool frozen = gateway.isSettlementFrozen();
		try gateway.rebindPayees(id, _payees()) {
			if (!frozen || closed[id]) violationP19 = true;
			if (!payeesBound[id]) ghostBound++;
			payeesBound[id] = true;
		} catch {}
	}

	function settleOut(uint256 seed, uint64 pct, uint64 rebate) external {
		if (ids.length == 0) return;
		bytes32 id = ids[seed % ids.length];
		IGateway.Order memory o = gateway.getOrderInfo(id);
		uint256 before = token.balanceOf(address(gateway));
		// Half the time settle all that remains, so orders do close.
		if (!closed[id] && o.currentBPS > 0) pct = seed % 2 == 0 ? uint64(o.currentBPS) : uint64(bound(pct, 1, o.currentBPS));
		rebate = uint64(bound(rebate, 0, MAX_BPS));
		// One attempt in five pays an address outside the list; it must never succeed (P19).
		address to = seed % 5 == 0 ? stranger : providers[seed % 2];
		bool frozen = gateway.isSettlementFrozen();
		vm.prank(aggregator);
		try gateway.settleOut(bytes32(seed), id, to, pct, rebate, _payees()) {
			if (closed[id]) violationP8 = true;
			if (frozen) violationP18 = true;
			if (!payeesBound[id] || to == stranger) violationP19 = true;
			ghostOut += before - token.balanceOf(address(gateway));
			ghostSplits++;
			if (gateway.getOrderInfo(id).isFulfilled) {
				closed[id] = true;
				ghostSettled++;
			}
		} catch {}
	}

	function refund(uint256 seed, uint256 fee) external {
		// Rarer than settlement, so orders also reach full settlement through splits.
		if (ids.length == 0 || seed % 4 != 0) return;
		bytes32 id = ids[seed % ids.length];
		IGateway.Order memory o = gateway.getOrderInfo(id);
		uint256 cap = o.protocolFee < o.amount ? o.protocolFee : o.amount;
		fee = bound(fee, 0, cap);
		uint256 before = token.balanceOf(address(gateway));
		bool frozen = gateway.isSettlementFrozen();
		vm.prank(aggregator);
		try gateway.refund(fee, id) {
			if (closed[id]) violationP8 = true;
			if (frozen) violationP18 = true;
			closed[id] = true;
			ghostOut += before - token.balanceOf(address(gateway));
			ghostRefunded++;
		} catch {}
	}

	function settleIn(uint256 seed, uint256 amount, uint96 senderFee, uint64 rebate) external {
		amount = bound(amount, 1, 1e30);
		senderFee = uint96(bound(senderFee, 0, 1e24));
		rebate = uint64(bound(rebate, 0, MAX_BPS));
		address p = providers[seed % 2];
		address s = senders[seed % senders.length];
		bytes32 orderId = seed % 2 == 0
			? _orderId(s, senderNonces[s] + 1)
			: keccak256(abi.encode('in', seed));
		_fund(p, amount + senderFee);
		bool paused = gateway.paused();
		bool listed = gateway.isTokenSupported(address(token));
		uint256 before = token.balanceOf(address(gateway));
		vm.prank(p);
		try gateway.settleIn(orderId, address(token), amount, feeRecipient, senderFee, recipient, 1, rebate) {
			if (paused) violationP13 = true;
			if (!listed) violationP15 = true;
			// Pulled and paid out in the same call; the balance check is P10's, the totals stay balanced.
			ghostIn += amount + senderFee;
			ghostOut += amount + senderFee - (token.balanceOf(address(gateway)) - before);
			ghostSettledIn++;
		} catch {}
	}

	function setFees(uint256 stt, uint256 ptt) external {
		if (!gateway.isTokenSupported(address(token))) return;
		_setFees(bound(stt, 0, MAX_BPS), bound(ptt, 0, MAX_BPS));
	}

	/// Closing is rare (one call in sixteen) and reopening is the next toggle, so most of the walk runs with money
	/// flowing while the paused and delisted states are still visited.
	function togglePause(uint256 seed) external {
		if (gateway.paused()) gateway.unpause();
		else if (seed % 16 == 0) gateway.pause();
	}

	/// Freezing is rare and the next toggle unfreezes, like togglePause.
	function toggleFreeze(uint256 seed) external {
		if (gateway.isSettlementFrozen()) gateway.unfreezeSettlement();
		else if (seed % 16 == 0) gateway.freezeSettlement();
	}

	/// Requiring payees is rare and the next toggle lifts it, like togglePause.
	function togglePayeesRequired(uint256 seed) external {
		if (gateway.isPayeesRequired()) gateway.setPayeesRequired(false);
		else if (seed % 16 == 0) gateway.setPayeesRequired(true);
	}

	function toggleListing(uint256 seed) external {
		if (!gateway.isTokenSupported(address(token))) gateway.settingManagerBool('token', address(token), 1);
		else if (seed % 16 == 0) gateway.settingManagerBool('token', address(token), 2);
	}

	/// Sum over open orders of what they still hold.
	function openHoldings() external view returns (uint256 total) {
		for (uint256 i; i < ids.length; i++) {
			IGateway.Order memory o = gateway.getOrderInfo(ids[i]);
			if (!o.isFulfilled && !o.isRefunded) total += o.amount + o.senderFee;
		}
	}

	function outsideBalances() external view returns (uint256) {
		return _outside();
	}
}

contract GatewayInvariants is GatewayBase {
	GatewayHandler internal handler;

	function setUp() public override {
		handler = new GatewayHandler();
		targetContract(address(handler));
		// Only the handler's actions: it inherits the fixture's public setUp(), which would redeploy the Gateway.
		bytes4[] memory selectors = new bytes4[](11);
		selectors[0] = GatewayHandler.createOrder.selector;
		selectors[1] = GatewayHandler.settleOut.selector;
		selectors[2] = GatewayHandler.refund.selector;
		selectors[3] = GatewayHandler.settleIn.selector;
		selectors[4] = GatewayHandler.setFees.selector;
		selectors[5] = GatewayHandler.togglePause.selector;
		selectors[6] = GatewayHandler.toggleListing.selector;
		selectors[7] = GatewayHandler.bindPayees.selector;
		selectors[8] = GatewayHandler.toggleFreeze.selector;
		selectors[9] = GatewayHandler.rebindPayees.selector;
		selectors[10] = GatewayHandler.togglePayeesRequired.selector;
		targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
	}

	function _balance() internal view returns (uint256) {
		return GatewayHandler(handler).token_() == address(0)
			? 0
			: MockERC20Like(handler.token_()).balanceOf(handler.gateway_());
	}

	/// P12: the Gateway holds exactly what its open orders still hold.
	function invariant_P12_gatewayHoldsExactlyItsOpenOrders() public view {
		assertEq(_balance(), handler.openHoldings());
	}

	/// P12 (flows): everything pulled in is either still held or was paid out; nothing is minted or lost.
	function invariant_P12_flowsBalance() public view {
		assertEq(handler.ghostIn(), handler.ghostOut() + _balance());
	}

	/// P8: no closed order ever paid out again.
	function invariant_P8_closedOrdersStayClosed() public view {
		assertFalse(handler.violationP8());
	}

	/// P13: no money came in while paused.
	function invariant_P13_pauseStopsMoneyIn() public view {
		assertFalse(handler.violationP13());
	}

	/// P15: no money came in for a delisted token.
	function invariant_P15_delistedTokenTakesNoNewMoney() public view {
		assertFalse(handler.violationP15());
	}

	/// P18: nothing settled, refunded or bound while settlement was frozen.
	function invariant_P18_freezeStopsSettlement() public view {
		assertFalse(handler.violationP18());
	}

	/// P19: every settlement went to an address in the order's bound list, no list was bound twice by the binder,
	/// and the owner rebound only open orders while settlement was frozen.
	function invariant_P19_settlementPaysOnlyBoundPayees() public view {
		assertFalse(handler.violationP19());
	}

	/// P20: no plain createOrder succeeded while payees were required.
	function invariant_P20_payeesRequiredStopsPlainCreateOrder() public view {
		assertFalse(handler.violationP20());
	}

	/// P17: settling in at senders' next createOrder ids never made a createOrder fail with OrderAlreadyExists.
	function invariant_P17_settleInNeverBlocksCreateOrder() public view {
		assertFalse(handler.violationP17());
	}

	/// Not vacuous: the walk creates, settles, refunds and settles in (see the counters with -vv).
	function afterInvariant() public {
		emit log_named_uint('created', handler.ghostCreated());
		emit log_named_uint('splits', handler.ghostSplits());
		emit log_named_uint('settled', handler.ghostSettled());
		emit log_named_uint('refunded', handler.ghostRefunded());
		emit log_named_uint('settledIn', handler.ghostSettledIn());
		emit log_named_uint('bound', handler.ghostBound());
	}
}

interface MockERC20Like {
	function balanceOf(address) external view returns (uint256);
}
