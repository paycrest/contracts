// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IOTCGateway} from '../../contracts/interfaces/IOTCGateway.sol';
import {OTCGatewayBase} from './OTCGatewayBase.sol';

/**
 * @title OTCGatewayVectorsTest
 * @notice Two jobs:
 *  1. Prove the test-side (local) EIP-712 hashing equals the contract's `hash*` views byte for byte, so every
 *     other suite's locally-built signature is exercising the real digest.
 *  2. Emit `test/vectors/otc-eip712.json`: domain, typehashes, a full LockAuth, every action digest, and the
 *     signatures produced by known test keys. The Go aggregator (`services/otc`) asserts byte-equal digests
 *     against this file, so a silent typed-data drift between Solidity and Go fails CI.
 */
contract OTCGatewayVectorsTest is OTCGatewayBase {
	uint256 internal constant PARTIAL_GROSS = 100_000e6;

	function test_vectors_localHashingMatchesContract() public {
		IOTCGateway.LockAuth memory a = defaultAuth();
		assertEq(hashAuth(a), gw.hashLockAuth(a), 'LockAuth');
		assertEq(domain, domainFor(address(gw)), 'domain');
		lockAs(a);
		assertEq(hashPayingLocal(ORDER), gw.hashPaying(ORDER), 'Paying');
		assertEq(hashReleaseLocal(ORDER), gw.hashRelease(ORDER), 'Release');
		assertEq(hashReleasePartialLocal(ORDER, 1234), gw.hashReleasePartial(ORDER, 1234), 'ReleasePartial');
		assertEq(hashWaiveLocal(ORDER), gw.hashWaive(ORDER), 'Waive');
		assertEq(hashCancelLocal(ORDER), gw.hashCancel(ORDER), 'Cancel');
		assertEq(LOCK_AUTH_TYPEHASH, gw.LOCK_AUTH_TYPEHASH());
		assertEq(PAYING_TYPEHASH, gw.PAYING_TYPEHASH());
		assertEq(RELEASE_TYPEHASH, gw.RELEASE_TYPEHASH());
		assertEq(RELEASE_PARTIAL_TYPEHASH, gw.RELEASE_PARTIAL_TYPEHASH());
		assertEq(WAIVE_TYPEHASH, gw.WAIVE_TYPEHASH());
		assertEq(CANCEL_TYPEHASH, gw.CANCEL_TYPEHASH());
	}

	function test_vectors_writeEip712Fixture() public {
		IOTCGateway.LockAuth memory a = defaultAuth();
		// Fixed timestamps so the fixture is stable across runs (setUp warps to 1_800_000_000).
		a.deadline = 1_800_172_800;
		a.validUntil = 1_800_000_900;
		lockAs(a);

		string memory root = 'vectors';
		vm.serializeUint(root, 'chainId', block.chainid);
		vm.serializeAddress(root, 'verifyingContract', address(gw));
		vm.serializeString(root, 'name', 'PaycrestOTCGateway');
		vm.serializeString(root, 'version', '1');
		vm.serializeBytes32(root, 'domainSeparator', gw.DOMAIN_SEPARATOR());
		vm.serializeString(root, 'typehashes', _typehashesJson());
		vm.serializeString(root, 'lockAuth', _lockAuthJson(a));
		vm.serializeString(root, 'testPrivateKeys', _keysJson());
		vm.serializeString(root, 'digests', _digestsJson(a));
		string memory json = vm.serializeString(root, 'signatures', _signaturesJson(a));
		vm.writeJson(json, 'test/vectors/otc-eip712.json');

		// The emitted signatures are accepted by the contract.
		vm.prank(stranger);
		gw.markPaying(ORDER, sigPaying(lpPk, ORDER));
		vm.prank(stranger);
		gw.settle(ORDER, sigRelease(senderPk, ORDER));
	}

	function _typehashesJson() internal returns (string memory) {
		string memory k = 'typehashes';
		vm.serializeBytes32(k, 'LockAuth', LOCK_AUTH_TYPEHASH);
		vm.serializeBytes32(k, 'Paying', PAYING_TYPEHASH);
		vm.serializeBytes32(k, 'Release', RELEASE_TYPEHASH);
		vm.serializeBytes32(k, 'ReleasePartial', RELEASE_PARTIAL_TYPEHASH);
		vm.serializeBytes32(k, 'Waive', WAIVE_TYPEHASH);
		return vm.serializeBytes32(k, 'Cancel', CANCEL_TYPEHASH);
	}

	function _lockAuthJson(IOTCGateway.LockAuth memory a) internal returns (string memory) {
		string memory k = 'lockAuth';
		vm.serializeBytes32(k, 'orderId', a.orderId);
		vm.serializeAddress(k, 'token', a.token);
		vm.serializeAddress(k, 'locker', a.locker);
		vm.serializeAddress(k, 'payee', a.payee);
		vm.serializeAddress(k, 'counterparty', a.counterparty);
		vm.serializeUint(k, 'amount', a.amount);
		vm.serializeUint(k, 'deadline', a.deadline);
		vm.serializeUint(k, 'feeBps', a.feeBps);
		vm.serializeUint(k, 'disputeDelay', a.disputeDelay);
		vm.serializeBytes32(k, 'quoteHash', a.quoteHash);
		return vm.serializeUint(k, 'validUntil', a.validUntil);
	}

	function _keysJson() internal returns (string memory) {
		string memory k = 'keys';
		vm.serializeUint(k, 'authSigner', authSignerPk);
		vm.serializeUint(k, 'locker', senderPk);
		return vm.serializeUint(k, 'counterparty', lpPk);
	}

	function _digestsJson(IOTCGateway.LockAuth memory a) internal returns (string memory) {
		string memory k = 'digests';
		vm.serializeBytes32(k, 'lockAuth', gw.hashLockAuth(a));
		vm.serializeBytes32(k, 'paying', gw.hashPaying(ORDER));
		vm.serializeBytes32(k, 'release', gw.hashRelease(ORDER));
		vm.serializeUint(k, 'releasePartialGross', PARTIAL_GROSS);
		vm.serializeBytes32(k, 'releasePartial', gw.hashReleasePartial(ORDER, PARTIAL_GROSS));
		vm.serializeBytes32(k, 'waive', gw.hashWaive(ORDER));
		return vm.serializeBytes32(k, 'cancel', gw.hashCancel(ORDER));
	}

	function _signaturesJson(IOTCGateway.LockAuth memory a) internal returns (string memory) {
		string memory k = 'signatures';
		vm.serializeBytes(k, 'lockAuthByAuthSigner', signAuth(a));
		vm.serializeBytes(k, 'payingByCounterparty', sigPaying(lpPk, ORDER));
		vm.serializeBytes(k, 'releaseByLocker', sigRelease(senderPk, ORDER));
		vm.serializeBytes(k, 'releasePartialByLocker', sigReleasePartial(senderPk, ORDER, PARTIAL_GROSS));
		vm.serializeBytes(k, 'releasePartialByCounterparty', sigReleasePartial(lpPk, ORDER, PARTIAL_GROSS));
		vm.serializeBytes(k, 'waiveByCounterparty', sigWaive(lpPk, ORDER));
		return vm.serializeBytes(k, 'cancelByLocker', sigCancel(senderPk, ORDER));
	}
}
