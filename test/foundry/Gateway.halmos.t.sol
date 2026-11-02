// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IGateway} from '../../contracts/interfaces/IGateway.sol';
import {GatewayBase} from './GatewayBase.sol';

/**
 * @title GatewayHalmos
 * @notice Bounded symbolic checks: Halmos runs every `check_` function for all inputs. The Gateway is the real
 * implementation behind a TransparentUpgradeableProxy, initialized as deployed; amounts are bounded to 2^96 (a
 * token supply far beyond any real one) to keep the arithmetic tractable, and fee settings, splits, rebates and
 * refund fees range over all their valid values. Each check states "if the call succeeded then <condition>" or
 * "the call never succeeds".
 */
contract GatewayHalmos is GatewayBase {
	uint256 internal constant AMOUNT_BOUND = 2 ** 96;

	address internal alice = address(uint160(0xA11CE));
	address internal feeRecipient = address(uint160(0xFEE));
	address internal refundTo = address(uint160(0x2EF));
	address internal provider = address(uint160(0x9120));
	address internal recipient = address(uint160(0x2EC1));

	function _call(address caller, bytes memory data) internal returns (bool ok) {
		vm.prank(caller);
		(ok, ) = address(gateway).call(data);
	}

	/* ==================================================================================== P1 */

	function check_P1_tokenSettingIsOwnerOnly(address caller, address value, uint256 status) public {
		vm.assume(caller != owner);
		assert(!_call(caller, abi.encodeCall(gateway.settingManagerBool, ('token', value, status))));
	}

	function check_P1_protocolAddressIsOwnerOnly(address caller, bytes32 what, address value) public {
		vm.assume(caller != owner);
		assert(!_call(caller, abi.encodeCall(gateway.updateProtocolAddress, (what, value))));
	}

	function check_P1_feeSettingsAreOwnerOnly(address caller, uint256 stt, uint256 ptt) public {
		vm.assume(caller != owner);
		assert(!_call(caller, abi.encodeCall(gateway.setTokenFeeSettings, (address(token), stt, ptt))));
	}

	function check_P1_pauseIsOwnerOnly(address caller) public {
		vm.assume(caller != owner);
		assert(!_call(caller, abi.encodeCall(gateway.pause, ())));
	}

	/* ==================================================================================== P2 */

	function check_P2_settleOutIsAggregatorOnly(address caller, uint64 pct, uint64 rebate) public {
		vm.assume(caller != aggregator);
		bytes32 id = _create(alice, 1_000_000, 0, address(0), refundTo);
		assert(!_call(caller, abi.encodeCall(gateway.settleOut, (bytes32(0), id, provider, pct, rebate))));
	}

	function check_P2_refundIsAggregatorOnly(address caller, uint256 fee) public {
		vm.assume(caller != aggregator);
		bytes32 id = _create(alice, 1_000_000, 0, address(0), refundTo);
		assert(!_call(caller, abi.encodeCall(gateway.refund, (fee, id))));
	}

	/* ==================================================================================== P6 */

	/// Two splits that settle the order pay out exactly the amount plus the sender fee, and leave nothing.
	function check_P6_twoSplitsPayExactly(
		uint256 amount,
		uint256 senderFee,
		uint256 stt,
		uint256 ptt,
		uint64 first,
		uint64 r1,
		uint64 r2
	) public {
		vm.assume(amount > 0 && amount < AMOUNT_BOUND && senderFee < AMOUNT_BOUND);
		vm.assume(stt <= MAX_BPS && ptt <= MAX_BPS && r1 <= MAX_BPS && r2 <= MAX_BPS);
		vm.assume(first > 0 && first < MAX_BPS);
		_setFees(stt, ptt);
		bytes32 id = _create(alice, amount, senderFee, feeRecipient, refundTo);

		_settleOut(id, provider, first, r1);
		_settleOut(id, provider, uint64(MAX_BPS) - first, r2);

		assert(_bal(provider) + _bal(treasury) + _bal(feeRecipient) == amount + senderFee);
		assert(_bal(address(gateway)) == 0);
		assert(_order(id).isFulfilled && _order(id).amount == 0);
	}

	/* ==================================================================================== P7 */

	/// One split pays the provider and treasury exactly its gross, never a rebate above the treasury fee, and
	/// reduces the remaining amount by exactly the gross.
	function check_P7_splitMath(uint256 amount, uint256 ptt, uint64 pct, uint64 rebate) public {
		vm.assume(amount > 0 && amount < AMOUNT_BOUND);
		vm.assume(ptt <= MAX_BPS && rebate <= MAX_BPS && pct > 0 && pct <= MAX_BPS);
		_setFees(0, ptt);
		bytes32 id = _create(alice, amount, 0, address(0), refundTo);

		_settleOut(id, provider, pct, rebate);

		uint256 gross = (amount * pct) / MAX_BPS;
		uint256 fee = (gross * ptt) / MAX_BPS;
		assert(_bal(provider) + _bal(treasury) == gross);
		assert(_bal(treasury) <= fee);
		assert(_order(id).amount == amount - gross);
	}

	/* ==================================================================================== P8 */

	/// Once fully settled, no split or refund ever succeeds again.
	function check_P8_fulfilledOrderIsFinal(uint64 pct, uint64 rebate, uint256 fee) public {
		bytes32 id = _create(alice, 1_000_000, 10, feeRecipient, refundTo);
		_settleOut(id, provider, uint64(MAX_BPS), 0);
		assert(!_call(aggregator, abi.encodeCall(gateway.settleOut, (bytes32(0), id, provider, pct, rebate))));
		assert(!_call(aggregator, abi.encodeCall(gateway.refund, (fee, id))));
	}

	/// Once refunded, no split or refund ever succeeds again.
	function check_P8_refundedOrderIsFinal(uint64 pct, uint64 rebate, uint256 fee) public {
		bytes32 id = _create(alice, 1_000_000, 10, feeRecipient, refundTo);
		_refund(id, 0);
		assert(!_call(aggregator, abi.encodeCall(gateway.settleOut, (bytes32(0), id, provider, pct, rebate))));
		assert(!_call(aggregator, abi.encodeCall(gateway.refund, (fee, id))));
	}

	/* ==================================================================================== P9 */

	/// A refund pays out exactly what the order holds: the fee to the treasury, the rest and the sender fee to
	/// the refund address; a fee above the order's protocol fee never succeeds.
	function check_P9_refundPaysWhatTheOrderHolds(uint256 amount, uint256 senderFee, uint256 ptt, uint256 fee) public {
		vm.assume(amount > 0 && amount < AMOUNT_BOUND && senderFee < AMOUNT_BOUND && ptt <= MAX_BPS);
		_setFees(0, ptt);
		bytes32 id = _create(alice, amount, senderFee, feeRecipient, refundTo);
		uint256 protocolFee = _order(id).protocolFee;

		bool ok = _call(aggregator, abi.encodeCall(gateway.refund, (fee, id)));

		if (fee > protocolFee) {
			assert(!ok);
		} else {
			assert(ok);
			assert(_bal(treasury) == fee);
			assert(_bal(refundTo) == amount - fee + senderFee);
			assert(_bal(address(gateway)) == 0);
		}
	}

	/* ==================================================================================== P10 */

	/// settleIn pays out exactly what it pulls in: the Gateway's balance does not move.
	function check_P10_settleInPassesEverythingThrough(
		uint256 amount,
		uint96 senderFee,
		uint256 stt,
		uint256 ptt,
		uint64 rebate,
		bytes32 id
	) public {
		vm.assume(amount > 0 && amount < AMOUNT_BOUND);
		vm.assume(stt <= MAX_BPS && ptt <= MAX_BPS && rebate <= MAX_BPS);
		_setFees(stt, ptt);
		_fund(provider, amount + senderFee);

		vm.prank(provider);
		gateway.settleIn(id, address(token), amount, feeRecipient, senderFee, recipient, 1, rebate);

		assert(_bal(address(gateway)) == 0);
		assert(_bal(recipient) + _bal(treasury) + _bal(provider) + _bal(feeRecipient) == amount + senderFee);
		assert(_bal(provider) <= (amount * ptt) / MAX_BPS);
	}

	/* ==================================================================================== P11 */

	/// The sender fee is split exactly between its recipient and the treasury.
	function check_P11_senderFeeSplit(uint96 fee, uint256 stt) public {
		vm.assume(stt <= MAX_BPS);
		_setFees(stt, 0);
		_fund(provider, 1 + uint256(fee));
		vm.prank(provider);
		gateway.settleIn(bytes32(uint256(1)), address(token), 1, feeRecipient, fee, recipient, 1, 0);
		assert(_bal(feeRecipient) + _bal(treasury) == fee);
		assert(_bal(feeRecipient) == fee - (uint256(fee) * stt) / MAX_BPS);
	}

	/* ==================================================================================== P14 */

	/// Fee settings succeed exactly when both are within MAX_BPS (for a supported token, as the owner).
	function check_P14_feeSettingBounds(uint256 stt, uint256 ptt) public {
		bool ok = _call(owner, abi.encodeCall(gateway.setTokenFeeSettings, (address(token), stt, ptt)));
		assert(ok == (stt <= MAX_BPS && ptt <= MAX_BPS));
	}
}
