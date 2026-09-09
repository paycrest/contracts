// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {IOTCGateway} from '../../contracts/interfaces/IOTCGateway.sol';
import {OTCGateway} from '../../contracts/OTCGateway.sol';
import {
	OTCGatewayBase,
	MockUSDC,
	MockFeeOnTransferToken,
	MockReentrantToken,
	MockERC1271Wallet
} from './OTCGatewayBase.sol';

/**
 * @title OTCGatewayTest
 * @notice Unit + fuzz coverage of docs/otc-gateway-spec.md. Test names carry the property id they claim
 * (`test_P4_…`, `testFuzz_P3_…`); scripts/check-otc-traceability.sh enforces that every P1..P15 is claimed.
 */
contract OTCGatewayTest is OTCGatewayBase {
	/* ==================================================================================== construction */

	function test_constructor_setsRolesAndDomain() public view {
		assertEq(gw.owner(), owner);
		assertEq(gw.pauser(), pauser);
		assertEq(gw.authSigner(), authSigner);
		assertEq(gw.getAggregator(), authSigner);
		assertEq(gw.arbiter(), arbiter);
		assertEq(gw.treasury(), treasury);
		assertEq(gw.disputeDelay(), DISPUTE_DELAY);
		assertTrue(gw.isTokenSupported(address(usdc)));
		assertTrue(gw.DOMAIN_SEPARATOR() != bytes32(0));
	}

	function test_constructor_rejectsZeroAddressesAndBadDelay() public {
		vm.expectRevert(bytes('ZeroAddress'));
		new OTCGateway(address(0), pauser, authSigner, arbiter, treasury, DISPUTE_DELAY);
		vm.expectRevert(bytes('ZeroAddress'));
		new OTCGateway(owner, address(0), authSigner, arbiter, treasury, DISPUTE_DELAY);
		vm.expectRevert(bytes('ZeroAddress'));
		new OTCGateway(owner, pauser, address(0), arbiter, treasury, DISPUTE_DELAY);
		vm.expectRevert(bytes('ZeroAddress'));
		new OTCGateway(owner, pauser, authSigner, address(0), treasury, DISPUTE_DELAY);
		vm.expectRevert(bytes('ZeroAddress'));
		new OTCGateway(owner, pauser, authSigner, arbiter, address(0), DISPUTE_DELAY);
		vm.expectRevert(bytes('DisputeDelayOutOfBounds'));
		new OTCGateway(owner, pauser, authSigner, arbiter, treasury, 1 days - 1);
		vm.expectRevert(bytes('DisputeDelayOutOfBounds'));
		new OTCGateway(owner, pauser, authSigner, arbiter, treasury, 30 days + 1);
	}

	/* ==================================================================================== lock */

	function test_lock_happyPath_storesLockAndPullsTokens() public {
		IOTCGateway.LockAuth memory a = defaultAuth();
		uint256 before = bal(sender);

		vm.expectEmit(true, true, true, true, address(gw));
		emit OtcLocked(
			ORDER,
			address(usdc),
			sender,
			lpPayout,
			lp,
			AMOUNT,
			a.deadline,
			FEE_BPS,
			DISPUTE_DELAY,
			QUOTE
		);
		bytes memory _sig = signAuth(a);
		vm.prank(sender);
		gw.lock(a, _sig);

		IOTCGateway.Lock memory l = gw.getLock(ORDER);
		assertEq(uint8(l.status), uint8(IOTCGateway.Status.Locked));
		assertEq(l.token, address(usdc));
		assertEq(l.locker, sender);
		assertEq(l.payee, lpPayout);
		assertEq(l.counterparty, lp);
		assertEq(l.amount, AMOUNT);
		assertEq(l.deadline, a.deadline);
		assertEq(l.payingAt, 0);
		assertEq(l.feeBps, FEE_BPS);
		assertEq(l.disputeDelay, DISPUTE_DELAY);
		assertEq(l.quoteHash, QUOTE);
		assertEq(bal(sender), before - AMOUNT);
		assertEq(bal(address(gw)), AMOUNT);
	}

	function test_lock_onrampShape_lpLocksSenderPays() public {
		// Onramp: LP is the locker (receives fiat), sender's signing wallet is the counterparty, payee may be an
		// exchange deposit address that never signs anything.
		address exchangeDeposit = makeAddr('exchangeDeposit');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.locker = lp;
		a.counterparty = sender;
		a.payee = exchangeDeposit;
		lockAs(a);

		vm.prank(sender);
		gw.markPaying(ORDER, '');
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Paying));

		vm.prank(lp);
		gw.settle(ORDER, '');
		assertEq(bal(exchangeDeposit), AMOUNT - feeFor(AMOUNT));
	}

	function test_P9_orderIdLocksAtMostOnceEver() public {
		lockDefault();
		IOTCGateway.LockAuth memory a = defaultAuth();
		bytes memory _sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('OrderAlreadyExists'));
		gw.lock(a, _sig);

		// Even after the lock reached a terminal state the id is burned.
		vm.prank(sender);
		gw.cancel(ORDER, '');
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Refunded));
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('OrderAlreadyExists'));
		gw.lock(a, _sig);

		bytes32 order2 = keccak256('order-2');
		a.orderId = order2;
		lockAs(a);
		vm.prank(sender);
		gw.settle(order2, '');
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('OrderAlreadyExists'));
		gw.lock(a, _sig);
	}

	function test_P10_lockRejectsBadAdmission() public {
		IOTCGateway.LockAuth memory a = defaultAuth();

		// wrong signer
		bytes memory _sig = signAuthWith(strangerPk, a);
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidAuthSignature'));
		gw.lock(a, _sig);

		// tampered field after signing
		bytes memory good = signAuth(a);
		a.amount = AMOUNT + 1;
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidAuthSignature'));
		gw.lock(a, good);
		a.amount = AMOUNT;

		// msg.sender is not the locker
		vm.prank(stranger);
		vm.expectRevert(bytes('OnlyLocker'));
		gw.lock(a, good);

		// expired admission ticket
		vm.warp(a.validUntil + 1);
		vm.prank(sender);
		vm.expectRevert(bytes('AuthExpired'));
		gw.lock(a, good);
		vm.warp(a.validUntil - 1);

		// dispute delay mismatch
		a.disputeDelay = DISPUTE_DELAY + 1;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('DisputeDelayMismatch'));
		gw.lock(a, _sig);
		a.disputeDelay = DISPUTE_DELAY;

		// payee == locker / counterparty == locker
		a.payee = sender;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('PayeeIsLocker'));
		gw.lock(a, _sig);
		a.payee = lpPayout;
		a.counterparty = sender;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('CounterpartyIsLocker'));
		gw.lock(a, _sig);
		a.counterparty = lp;

		// zero fields / bounds
		a.amount = 0;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('AmountIsZero'));
		gw.lock(a, _sig);
		a.amount = AMOUNT;
		a.feeBps = gw.MAX_FEE_BPS() + 1;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('FeeTooHigh'));
		gw.lock(a, _sig);
		a.feeBps = FEE_BPS;
		a.payee = address(0);
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('ZeroAddress'));
		gw.lock(a, _sig);
		a.payee = lpPayout;

		// deadline already passed
		a.deadline = uint64(block.timestamp);
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('DeadlinePassed'));
		gw.lock(a, _sig);
		a.deadline = uint64(block.timestamp) + LOCK_WINDOW;

		// unsupported token
		MockUSDC other = new MockUSDC();
		a.token = address(other);
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('TokenNotSupported'));
		gw.lock(a, _sig);
		a.token = address(usdc);

		// nothing above left state behind
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.None));
		lockAs(a);
	}

	function test_P10_lockRejectsForeignDomainSignature() public {
		IOTCGateway.LockAuth memory a = defaultAuth();
		bytes32 structHash = keccak256(
			abi.encode(
				gw.LOCK_AUTH_TYPEHASH(),
				a.orderId,
				a.token,
				a.locker,
				a.payee,
				a.counterparty,
				a.amount,
				a.deadline,
				a.feeBps,
				a.disputeDelay,
				a.quoteHash,
				a.validUntil
			)
		);
		// Same struct, domain of a different chain / different contract.
		bytes32 foreignDomain = keccak256(
			abi.encode(
				keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
				keccak256('PaycrestOTCGateway'),
				keccak256('1'),
				block.chainid + 1,
				address(gw)
			)
		);
		bytes32 foreignDigest = keccak256(abi.encodePacked('\x19\x01', foreignDomain, structHash));
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidAuthSignature'));
		gw.lock(a, signDigest(authSignerPk, foreignDigest));
	}

	function test_P10_lockRejectsFeeOnTransferToken() public {
		MockFeeOnTransferToken fee = new MockFeeOnTransferToken();
		vm.prank(owner);
		gw.setTokenSupported(address(fee), true);
		fee.mint(sender, AMOUNT);
		vm.prank(sender);
		fee.approve(address(gw), AMOUNT);

		IOTCGateway.LockAuth memory a = defaultAuth();
		a.token = address(fee);
		bytes memory _sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('TokenTransferMismatch'));
		gw.lock(a, _sig);
	}

	function testFuzz_P10_lockWithPermitIsRelayableOnlyForTheLockersOwnPermit(address relayer) public {
		vm.assume(relayer != address(0));
		// Fresh locker with no standing allowance: only a permit can make the pull succeed.
		uint256 lockerPk = 0xF00D;
		address locker = vm.addr(lockerPk);
		vm.assume(relayer != locker);
		usdc.mint(locker, AMOUNT);
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.locker = locker;
		bytes memory authSig = signAuth(a);
		uint256 permitDeadline = block.timestamp + 1 hours;

		// Permit signed by someone else: it is not the locker's permit, so a relayer is refused outright.
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(strangerPk, _permitDigest(stranger, AMOUNT, permitDeadline));
		vm.prank(relayer);
		vm.expectRevert(bytes('OnlyLocker'));
		gw.lockWithPermit(a, authSig, permitDeadline, v, r, s);

		// Locker's permit for a different value: the gateway always presents `a.amount` to permit, so the
		// signature does not verify, no allowance is granted, and the relayer is refused.
		(v, r, s) = vm.sign(lockerPk, _permitDigest(locker, AMOUNT - 1, permitDeadline));
		vm.prank(relayer);
		vm.expectRevert(bytes('OnlyLocker'));
		gw.lockWithPermit(a, authSig, permitDeadline, v, r, s);

		// Locker's own permit for the exact amount: any relayer may submit it.
		(v, r, s) = vm.sign(lockerPk, _permitDigest(locker, AMOUNT, permitDeadline));
		vm.prank(relayer);
		gw.lockWithPermit(a, authSig, permitDeadline, v, r, s);
		assertEq(gw.getLock(ORDER).locker, locker);
		assertEq(bal(locker), 0);

		// A stale permit (already consumed) plus a standing allowance must NOT let a third party pull the
		// locker's tokens; the locker's own submission still goes through (front-run cannot brick it).
		bytes32 order2 = keccak256('order-2');
		a.orderId = order2;
		usdc.mint(locker, AMOUNT);
		vm.prank(locker);
		usdc.approve(address(gw), AMOUNT);
		bytes memory authSig2 = signAuth(a);
		vm.assume(relayer != locker);
		vm.prank(relayer);
		vm.expectRevert(bytes('OnlyLocker'));
		gw.lockWithPermit(a, authSig2, permitDeadline, v, r, s);
		vm.prank(locker);
		gw.lockWithPermit(a, authSig2, permitDeadline, v, r, s); // stale permit caught, locker itself allowed
		assertEq(gw.getLock(order2).locker, locker);
	}

	function _permitDigest(address ownerAddr, uint256 value, uint256 deadline) internal view returns (bytes32) {
		bytes32 structHash = keccak256(
			abi.encode(
				keccak256('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'),
				ownerAddr,
				address(gw),
				value,
				usdc.nonces(ownerAddr),
				deadline
			)
		);
		return keccak256(abi.encodePacked('\x19\x01', usdc.DOMAIN_SEPARATOR(), structHash));
	}

	/* ==================================================================================== markPaying (P5) */

	function test_P5_onlyCounterpartyEntersPaying() public {
		lockDefault();
		address[5] memory notAllowed = [sender, authSigner, owner, arbiter, stranger];
		for (uint256 i; i < notAllowed.length; i++) {
			vm.prank(notAllowed[i]);
			vm.expectRevert(bytes('InvalidSignature'));
			gw.markPaying(ORDER, '');
		}
		// A signature by anyone but the counterparty is rejected even when relayed.
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.markPaying(ORDER, sigPaying(senderPk, ORDER));

		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcPaying(ORDER, lp, uint64(block.timestamp));
		vm.prank(stranger); // relayed with the counterparty's signature
		gw.markPaying(ORDER, sigPaying(lpPk, ORDER));
		IOTCGateway.Lock memory l = gw.getLock(ORDER);
		assertEq(uint8(l.status), uint8(IOTCGateway.Status.Paying));
		assertEq(l.payingAt, uint64(block.timestamp));

		vm.prank(lp);
		vm.expectRevert(bytes('NotLocked'));
		gw.markPaying(ORDER, '');
	}

	function test_P5_lockerCannotExitPayingAlone() public {
		lockDefault();
		markPayingDefault();

		vm.prank(sender);
		vm.expectRevert(bytes('NotLocked'));
		gw.cancel(ORDER, '');
		vm.prank(stranger);
		vm.expectRevert(bytes('NotLocked'));
		gw.cancel(ORDER, sigCancel(senderPk, ORDER));
		vm.warp(block.timestamp + 365 days);
		vm.expectRevert(bytes('NotLocked'));
		gw.refundExpired(ORDER);

		// Partial bounds: 0 and the full amount are not partials (use waive / settle instead).
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidPartialAmount'));
		gw.settlePartial(ORDER, 0, '', '');
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidPartialAmount'));
		gw.settlePartial(ORDER, AMOUNT, '', '');

		// Partial without the counterparty is the disguised-cancel path and must fail.
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settlePartial(ORDER, 1, '', '');
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settlePartial(ORDER, 1, '', sigReleasePartial(senderPk, ORDER, 1));

		// The only things the locker alone can still do: full settle.
		vm.prank(sender);
		gw.settle(ORDER, '');
		assertEq(bal(lpPayout), AMOUNT - feeFor(AMOUNT));
	}

	function test_P5_tokensReturnFromPayingOnlyViaWaiveCoSignedPartialOrArbiter() public {
		// waive
		lockDefault();
		markPayingDefault();
		uint256 before = bal(sender);
		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcRefunded(ORDER, sender, AMOUNT, IOTCGateway.RefundReason.Waived);
		vm.prank(stranger);
		gw.waive(ORDER, sigWaive(lpPk, ORDER));
		assertEq(bal(sender), before + AMOUNT);

		// co-signed partial
		bytes32 o2 = keccak256('o2');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = o2;
		lockAs(a);
		vm.prank(lp);
		gw.markPaying(o2, '');
		uint256 gross = AMOUNT / 3;
		before = bal(sender);
		vm.prank(stranger);
		gw.settlePartial(o2, gross, sigReleasePartial(senderPk, o2, gross), sigReleasePartial(lpPk, o2, gross));
		assertEq(bal(sender), before + (AMOUNT - gross));
		assertEq(bal(lpPayout), gross - feeFor(gross));

		// arbiter after delay
		bytes32 o3 = keccak256('o3');
		a.orderId = o3;
		lockAs(a);
		vm.prank(lp);
		gw.markPaying(o3, '');
		vm.warp(block.timestamp + DISPUTE_DELAY);
		before = bal(sender);
		vm.prank(arbiter);
		gw.arbitrate(o3, 0);
		assertEq(bal(sender), before + AMOUNT);
	}

	/* ==================================================================================== settle (P4) */

	function test_P4_payeePaidOnlyByLockerCoSignedPartialOrArbiter() public {
		lockDefault();

		// Not the locker, no signature.
		address[5] memory notAllowed = [lp, lpPayout, authSigner, owner, stranger];
		for (uint256 i; i < notAllowed.length; i++) {
			vm.prank(notAllowed[i]);
			vm.expectRevert(bytes('InvalidSignature'));
			gw.settle(ORDER, '');
		}
		// Counterparty / stranger signatures are not a release.
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, sigRelease(lpPk, ORDER));
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, sigRelease(strangerPk, ORDER));
		// Arbiter cannot act in Locked.
		vm.prank(arbiter);
		vm.expectRevert(bytes('NotPaying'));
		gw.arbitrate(ORDER, AMOUNT);
		assertEq(bal(lpPayout), 0);

		// Locker's signed release, relayed by anyone.
		uint256 fee = feeFor(AMOUNT);
		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcSettled(ORDER, lpPayout, AMOUNT, fee, 0, IOTCGateway.SettledBy.Locker);
		vm.prank(stranger);
		gw.settle(ORDER, sigRelease(senderPk, ORDER));
		assertEq(bal(lpPayout), AMOUNT - fee);
		assertEq(gw.accruedFees(address(usdc)), fee);
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Settled));
	}

	function test_P4_settleDirectlyByLockerFromLockedAndFromPaying() public {
		lockDefault();
		vm.prank(sender);
		gw.settle(ORDER, '');
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Settled));

		bytes32 o2 = keccak256('o2');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = o2;
		lockAs(a);
		vm.prank(lp);
		gw.markPaying(o2, '');
		vm.prank(sender);
		gw.settle(o2, '');
		assertEq(uint8(status(o2)), uint8(IOTCGateway.Status.Settled));
	}

	function test_P4_arbitrateOnlyArbiterOnlyPayingOnlyAfterDelay() public {
		lockDefault();
		markPayingDefault();
		uint64 payingAt = gw.getLock(ORDER).payingAt;

		vm.prank(owner);
		vm.expectRevert(bytes('OnlyArbiter'));
		gw.arbitrate(ORDER, AMOUNT);

		vm.warp(payingAt + DISPUTE_DELAY - 1);
		vm.prank(arbiter);
		vm.expectRevert(bytes('DisputeDelayNotElapsed'));
		gw.arbitrate(ORDER, AMOUNT);

		vm.warp(payingAt + DISPUTE_DELAY);
		vm.prank(arbiter);
		vm.expectRevert(bytes('InvalidAmount'));
		gw.arbitrate(ORDER, AMOUNT + 1);

		// full to payee: no transfer to locker at all
		uint256 lockerBefore = bal(sender);
		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcSettled(ORDER, lpPayout, AMOUNT, feeFor(AMOUNT), 0, IOTCGateway.SettledBy.Arbiter);
		vm.prank(arbiter);
		gw.arbitrate(ORDER, AMOUNT);
		assertEq(bal(sender), lockerBefore);
		assertEq(bal(lpPayout), AMOUNT - feeFor(AMOUNT));
	}

	function test_P4_arbitrateSplit() public {
		lockDefault();
		markPayingDefault();
		vm.warp(block.timestamp + DISPUTE_DELAY);
		uint256 gross = 100_000e6;
		uint256 lockerBefore = bal(sender);
		vm.prank(arbiter);
		gw.arbitrate(ORDER, gross);
		assertEq(bal(lpPayout), gross - feeFor(gross));
		assertEq(bal(sender), lockerBefore + AMOUNT - gross);
		assertEq(gw.accruedFees(address(usdc)), feeFor(gross));
	}

	function test_P4_settleViaERC1271LockerAndCounterparty() public {
		uint256 walletOwnerPk = 0x5AFE;
		MockERC1271Wallet lockerWallet = new MockERC1271Wallet(vm.addr(walletOwnerPk));
		uint256 cpOwnerPk = 0x5AFE2;
		MockERC1271Wallet cpWallet = new MockERC1271Wallet(vm.addr(cpOwnerPk));

		usdc.mint(address(lockerWallet), AMOUNT);
		lockerWallet.exec(address(usdc), abi.encodeCall(usdc.approve, (address(gw), AMOUNT)));

		IOTCGateway.LockAuth memory a = defaultAuth();
		a.locker = address(lockerWallet);
		a.counterparty = address(cpWallet);
		bytes memory authSig = signAuth(a);
		lockerWallet.exec(address(gw), abi.encodeCall(gw.lock, (a, authSig)));
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Locked));

		// Counterparty wallet signs Paying via its owner key (ERC-1271 path), relayed by a stranger.
		vm.prank(stranger);
		gw.markPaying(ORDER, sigPaying(cpOwnerPk, ORDER));
		// A signature by a non-owner of the wallet is rejected.
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, sigRelease(strangerPk, ORDER));
		// Locker wallet's owner signs Release (ERC-1271 path).
		vm.prank(stranger);
		gw.settle(ORDER, sigRelease(walletOwnerPk, ORDER));
		assertEq(bal(lpPayout), AMOUNT - feeFor(AMOUNT));
	}

	function test_P4_blacklistedPayeeIsResolvedByArbiterRefund() public {
		lockDefault();
		markPayingDefault();
		usdc.setBlacklisted(lpPayout, true);

		vm.prank(sender);
		vm.expectRevert(bytes('Blacklistable: account is blacklisted'));
		gw.settle(ORDER, '');
		// Still Paying: the failed settle changed nothing.
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Paying));

		vm.warp(block.timestamp + DISPUTE_DELAY);
		uint256 before = bal(sender);
		vm.prank(arbiter);
		gw.arbitrate(ORDER, 0);
		assertEq(bal(sender), before + AMOUNT);
	}

	function test_P4_blacklistedLockerIsResolvedByArbiterFullSettle() public {
		lockDefault();
		markPayingDefault();
		usdc.setBlacklisted(sender, true);
		vm.warp(block.timestamp + DISPUTE_DELAY);
		vm.prank(arbiter);
		gw.arbitrate(ORDER, AMOUNT); // remainder == 0, so no transfer to the blacklisted locker
		assertEq(bal(lpPayout), AMOUNT - feeFor(AMOUNT));
	}

	/* ==================================================================================== fee / conservation */

	function testFuzz_P3_feeExactness(uint32 feeBps, uint256 payeeGross) public {
		feeBps = uint32(bound(feeBps, 0, gw.MAX_FEE_BPS()));
		payeeGross = bound(payeeGross, 1, AMOUNT - 1);
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.feeBps = feeBps;
		lockAs(a);

		// Owner changing the global settings after lock cannot change this lock's fee.
		vm.prank(owner);
		gw.setDisputeDelay(5 days);

		uint256 feesBefore = gw.accruedFees(address(usdc));
		vm.prank(sender);
		gw.settlePartial(ORDER, payeeGross, '', sigReleasePartial(lpPk, ORDER, payeeGross));
		uint256 expectedFee = (payeeGross * feeBps) / MAX_BPS;
		assertEq(gw.accruedFees(address(usdc)) - feesBefore, expectedFee);
		assertEq(bal(lpPayout), payeeGross - expectedFee);
	}

	function testFuzz_P12_conservation(uint256 payeeGross, uint32 feeBps, bool viaArbiter) public {
		feeBps = uint32(bound(feeBps, 0, gw.MAX_FEE_BPS()));
		payeeGross = bound(payeeGross, 0, AMOUNT);
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.feeBps = feeBps;
		lockAs(a);
		vm.prank(lp);
		gw.markPaying(ORDER, '');

		uint256 lockerBefore = bal(sender);
		uint256 payeeBefore = bal(lpPayout);
		uint256 feesBefore = gw.accruedFees(address(usdc));
		uint256 gwBefore = bal(address(gw));

		if (viaArbiter) {
			vm.warp(block.timestamp + DISPUTE_DELAY);
			vm.prank(arbiter);
			gw.arbitrate(ORDER, payeeGross);
		} else if (payeeGross == AMOUNT) {
			vm.prank(sender);
			gw.settle(ORDER, '');
		} else if (payeeGross == 0) {
			vm.prank(lp);
			gw.waive(ORDER, '');
		} else {
			vm.prank(sender);
			gw.settlePartial(ORDER, payeeGross, '', sigReleasePartial(lpPk, ORDER, payeeGross));
		}

		uint256 toLocker = bal(sender) - lockerBefore;
		uint256 toPayee = bal(lpPayout) - payeeBefore;
		uint256 fee = gw.accruedFees(address(usdc)) - feesBefore;
		assertEq(toLocker + toPayee + fee, AMOUNT, 'conservation');
		assertEq(gwBefore - bal(address(gw)), toLocker + toPayee, 'gateway only released what left');
		if (payeeGross == 0) assertEq(fee, 0);
	}

	/* ==================================================================================== P6 liveness */

	function test_P6_lockerCanAlwaysCancelWhileLocked() public {
		lockDefault();
		// Even paused and even with the token de-whitelisted.
		vm.prank(pauser);
		gw.pause();
		vm.prank(owner);
		gw.setTokenSupported(address(usdc), false);

		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.cancel(ORDER, '');

		uint256 before = bal(sender);
		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcRefunded(ORDER, sender, AMOUNT, IOTCGateway.RefundReason.Cancelled);
		vm.prank(stranger);
		gw.cancel(ORDER, sigCancel(senderPk, ORDER));
		assertEq(bal(sender), before + AMOUNT);
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Refunded));
	}

	function test_P6_refundExpiredByAnyoneAfterDeadlineAndNotBefore() public {
		IOTCGateway.LockAuth memory a = lockDefault();
		vm.warp(a.deadline);
		vm.prank(stranger);
		vm.expectRevert(bytes('NotExpired'));
		gw.refundExpired(ORDER);

		vm.warp(uint256(a.deadline) + 1);
		// markPaying after the deadline must not freeze an expired lock.
		vm.prank(lp);
		vm.expectRevert(bytes('DeadlinePassed'));
		gw.markPaying(ORDER, '');

		vm.prank(pauser);
		gw.pause();
		uint256 before = bal(sender);
		vm.expectEmit(true, true, false, true, address(gw));
		emit OtcRefunded(ORDER, sender, AMOUNT, IOTCGateway.RefundReason.Expired);
		vm.prank(stranger);
		gw.refundExpired(ORDER);
		assertEq(bal(sender), before + AMOUNT);
	}

	function test_P6_waiveWorksFromLocked() public {
		lockDefault();
		uint256 before = bal(sender);
		vm.prank(lp);
		gw.waive(ORDER, '');
		assertEq(bal(sender), before + AMOUNT);
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Refunded));
	}

	/* ==================================================================================== P7 terminal */

	function test_P7_terminalStatesAreAbsorbing() public {
		lockDefault();
		vm.prank(sender);
		gw.settle(ORDER, '');
		_assertAbsorbing(ORDER);

		bytes32 o2 = keccak256('o2');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = o2;
		lockAs(a);
		vm.prank(sender);
		gw.cancel(o2, '');
		_assertAbsorbing(o2);
		assertEq(bal(address(gw)), gw.accruedFees(address(usdc)));
	}

	function _assertAbsorbing(bytes32 orderId) internal {
		uint256 gwBefore = bal(address(gw));
		vm.startPrank(sender);
		vm.expectRevert(bytes('NotOpen'));
		gw.settle(orderId, '');
		vm.expectRevert(bytes('NotOpen'));
		gw.settlePartial(orderId, 1, '', '');
		vm.expectRevert(bytes('NotLocked'));
		gw.cancel(orderId, '');
		vm.stopPrank();
		vm.prank(lp);
		vm.expectRevert(bytes('NotLocked'));
		gw.markPaying(orderId, '');
		vm.prank(lp);
		vm.expectRevert(bytes('NotOpen'));
		gw.waive(orderId, '');
		vm.warp(block.timestamp + 400 days);
		vm.expectRevert(bytes('NotLocked'));
		gw.refundExpired(orderId);
		vm.prank(arbiter);
		vm.expectRevert(bytes('NotPaying'));
		gw.arbitrate(orderId, 0);
		assertEq(bal(address(gw)), gwBefore);
	}

	/* ==================================================================================== P8 pause / whitelist */

	function test_P8_pauseAndDewhitelistBlockOnlyNewLocks() public {
		lockDefault();
		bytes32 o2 = keccak256('o2');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = o2;
		lockAs(a);
		bytes32 o3 = keccak256('o3');
		a.orderId = o3;
		lockAs(a);

		vm.prank(stranger);
		vm.expectRevert(bytes('OnlyPauser'));
		gw.pause();
		vm.prank(pauser);
		gw.pause();
		assertTrue(gw.paused());

		bytes32 o4 = keccak256('o4');
		a.orderId = o4;
		bytes memory _sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('Pausable: paused'));
		gw.lock(a, _sig);
		bytes memory pausedSig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('Pausable: paused'));
		gw.lockWithPermit(a, pausedSig, 0, 0, 0, 0);

		// Every exit still works while paused.
		vm.prank(lp);
		gw.markPaying(ORDER, '');
		vm.prank(sender);
		gw.settle(ORDER, '');
		vm.prank(lp);
		gw.waive(o2, '');
		vm.prank(lp);
		gw.markPaying(o3, '');
		vm.warp(block.timestamp + DISPUTE_DELAY);
		vm.prank(arbiter);
		gw.arbitrate(o3, AMOUNT / 2);
		vm.prank(treasury);
		gw.withdrawFees(address(usdc));

		// Only the owner unpauses.
		vm.prank(pauser);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.unpause();
		vm.prank(owner);
		gw.unpause();

		// De-whitelisting blocks only new locks for that token.
		vm.prank(owner);
		gw.setTokenSupported(address(usdc), false);
		a.deadline = uint64(block.timestamp) + LOCK_WINDOW;
		a.validUntil = uint64(block.timestamp) + AUTH_VALIDITY;
		_sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('TokenNotSupported'));
		gw.lock(a, _sig);
		vm.prank(owner);
		gw.setTokenSupported(address(usdc), true);
		lockAs(a);
		vm.prank(owner);
		gw.setTokenSupported(address(usdc), false);
		vm.prank(sender);
		gw.settle(o4, '');

		// Owner may also pause (defence in depth) — still only new locks.
		vm.prank(owner);
		gw.pause();
		assertTrue(gw.paused());
	}

	/* ==================================================================================== P11 owner */

	function test_P11_ownerCannotTouchAnExistingLock() public {
		lockDefault();
		IOTCGateway.Lock memory before = gw.getLock(ORDER);
		uint256 gwBal = bal(address(gw));

		vm.startPrank(owner);
		gw.setDisputeDelay(10 days);
		gw.setArbiter(makeAddr('arbiter2'));
		gw.setTreasury(makeAddr('treasury2'));
		gw.setAuthSigner(makeAddr('signer2'));
		gw.setPauser(makeAddr('pauser2'));
		gw.setTokenSupported(address(usdc), false);
		gw.pause();
		vm.expectRevert(bytes('NoFees'));
		gw.withdrawFees(address(usdc));
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, '');
		vm.expectRevert(bytes('InvalidSignature'));
		gw.cancel(ORDER, '');
		vm.expectRevert(bytes('InvalidSignature'));
		gw.markPaying(ORDER, '');
		vm.expectRevert(bytes('OnlyArbiter'));
		gw.arbitrate(ORDER, 0);
		vm.stopPrank();

		IOTCGateway.Lock memory after_ = gw.getLock(ORDER);
		assertEq(keccak256(abi.encode(before)), keccak256(abi.encode(after_)));
		assertEq(bal(address(gw)), gwBal);
		assertEq(after_.disputeDelay, DISPUTE_DELAY);

		// The new arbiter is what applies to this lock (arbiter is global by design).
		vm.prank(lp);
		gw.markPaying(ORDER, '');
		vm.warp(block.timestamp + DISPUTE_DELAY); // the lock's own delay, not the new 10 days
		vm.prank(arbiter);
		vm.expectRevert(bytes('OnlyArbiter'));
		gw.arbitrate(ORDER, 0);
		vm.prank(makeAddr('arbiter2'));
		gw.arbitrate(ORDER, 0);
	}

	function test_P11_setterAccessControlAndBounds() public {
		vm.startPrank(stranger);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setDisputeDelay(2 days);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setArbiter(stranger);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setTreasury(stranger);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setAuthSigner(stranger);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setPauser(stranger);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.setTokenSupported(address(usdc), false);
		vm.expectRevert(bytes('Ownable: caller is not the owner'));
		gw.unpause();
		vm.stopPrank();

		vm.startPrank(owner);
		vm.expectRevert(bytes('DisputeDelayOutOfBounds'));
		gw.setDisputeDelay(1 days - 1);
		vm.expectRevert(bytes('DisputeDelayOutOfBounds'));
		gw.setDisputeDelay(30 days + 1);
		vm.expectRevert(bytes('ZeroAddress'));
		gw.setArbiter(address(0));
		vm.expectRevert(bytes('ZeroAddress'));
		gw.setTreasury(address(0));
		vm.expectRevert(bytes('ZeroAddress'));
		gw.setAuthSigner(address(0));
		vm.expectRevert(bytes('ZeroAddress'));
		gw.setPauser(address(0));
		vm.expectRevert(bytes('ZeroAddress'));
		gw.setTokenSupported(address(0), true);
		vm.expectEmit(true, true, false, true, address(gw));
		emit ProtocolAddressUpdated('arbiter', stranger);
		gw.setArbiter(stranger);
		vm.expectEmit(false, false, false, true, address(gw));
		emit DisputeDelayUpdated(2 days);
		gw.setDisputeDelay(2 days);
		vm.stopPrank();

		// Rotating the auth signer invalidates outstanding admission tickets.
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.disputeDelay = 2 days;
		bytes memory sig = signAuth(a);
		vm.prank(owner);
		gw.setAuthSigner(stranger);
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidAuthSignature'));
		gw.lock(a, sig);
		bytes memory _sig = signAuthWith(strangerPk, a);
		vm.prank(sender);
		gw.lock(a, _sig);
	}

	/* ==================================================================================== P2 / P15 fees */

	function test_P2_withdrawFeesOnlyToTreasuryByTreasuryOrOwner() public {
		lockDefault();
		vm.prank(sender);
		gw.settle(ORDER, '');
		uint256 fee = feeFor(AMOUNT);
		assertEq(gw.accruedFees(address(usdc)), fee);

		vm.prank(stranger);
		vm.expectRevert(bytes('OnlyTreasury'));
		gw.withdrawFees(address(usdc));

		vm.expectEmit(true, true, false, true, address(gw));
		emit FeesWithdrawn(address(usdc), treasury, fee);
		vm.prank(treasury);
		gw.withdrawFees(address(usdc));
		assertEq(bal(treasury), fee);
		assertEq(gw.accruedFees(address(usdc)), 0);
		assertEq(bal(address(gw)), 0);

		vm.prank(owner);
		vm.expectRevert(bytes('NoFees'));
		gw.withdrawFees(address(usdc));
	}

	function test_P15_settlementNeverDependsOnTreasury() public {
		// Treasury is blacklisted (cannot receive) and the setter is a reverting contract: settlement still works.
		usdc.setBlacklisted(treasury, true);
		lockDefault();
		markPayingDefault();
		vm.prank(sender);
		gw.settle(ORDER, '');
		assertEq(gw.accruedFees(address(usdc)), feeFor(AMOUNT));

		vm.prank(owner);
		vm.expectRevert(bytes('Blacklistable: account is blacklisted'));
		gw.withdrawFees(address(usdc));
		// Fees are retained, not lost, until treasury is fixed.
		assertEq(gw.accruedFees(address(usdc)), feeFor(AMOUNT));
		usdc.setBlacklisted(treasury, false);
		vm.prank(owner);
		gw.withdrawFees(address(usdc));
		assertEq(bal(treasury), feeFor(AMOUNT));
	}

	/* ==================================================================================== P13 reentrancy */

	function test_P13_reentrancyIntoFundMovingFunctionsIsBlocked() public {
		MockReentrantToken rnt = new MockReentrantToken();
		vm.prank(owner);
		gw.setTokenSupported(address(rnt), true);
		rnt.mint(sender, AMOUNT);
		vm.prank(sender);
		rnt.approve(address(gw), type(uint256).max);

		IOTCGateway.LockAuth memory a = defaultAuth();
		a.token = address(rnt);

		// Re-enter lock during the lock's own transferFrom.
		rnt.arm(address(gw), abi.encodeCall(gw.lock, (a, signAuth(a))));
		bytes memory _sig = signAuth(a);
		vm.prank(sender);
		vm.expectRevert(bytes('ReentrancyGuard: reentrant call'));
		gw.lock(a, _sig);
		rnt.disarm();

		lockAs(a);

		// Re-enter cancel during settle's payout transfer.
		rnt.arm(address(gw), abi.encodeCall(gw.cancel, (ORDER, '')));
		vm.prank(sender);
		vm.expectRevert(bytes('ReentrancyGuard: reentrant call'));
		gw.settle(ORDER, '');
		rnt.disarm();

		// Re-enter settle during cancel's refund transfer.
		rnt.arm(address(gw), abi.encodeCall(gw.settle, (ORDER, '')));
		vm.prank(sender);
		vm.expectRevert(bytes('ReentrancyGuard: reentrant call'));
		gw.cancel(ORDER, '');
		rnt.disarm();

		// Re-enter withdrawFees during arbitrate.
		vm.prank(lp);
		gw.markPaying(ORDER, '');
		vm.warp(block.timestamp + DISPUTE_DELAY);
		rnt.arm(address(gw), abi.encodeCall(gw.withdrawFees, (address(rnt))));
		vm.prank(arbiter);
		vm.expectRevert(bytes('ReentrancyGuard: reentrant call'));
		gw.arbitrate(ORDER, AMOUNT);
		rnt.disarm();

		// Disarmed, the same calls succeed and the lock is intact until then.
		assertEq(uint8(status(ORDER)), uint8(IOTCGateway.Status.Paying));
		vm.prank(arbiter);
		gw.arbitrate(ORDER, AMOUNT);
		assertEq(rnt.balanceOf(lpPayout), AMOUNT - feeFor(AMOUNT));
	}

	/* ==================================================================================== P14 signature domain */

	function test_P14_signaturesAreBoundToActionOrderAndTerms() public {
		lockDefault();
		bytes32 o2 = keccak256('o2');
		IOTCGateway.LockAuth memory a = defaultAuth();
		a.orderId = o2;
		lockAs(a);

		// Release for order 1 is not a release for order 2.
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(o2, sigRelease(senderPk, ORDER));
		// Paying signature is not a Release / Waive / Cancel.
		bytes memory paying = sigPaying(lpPk, ORDER);
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, paying);
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.waive(ORDER, paying);
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.cancel(ORDER, sigWaive(senderPk, ORDER));
		// Release signed over different display terms (wrong payee / amount) is rejected.
		bytes32 wrongTerms = keccak256(
			abi.encodePacked(
				'\x19\x01',
				gw.DOMAIN_SEPARATOR(),
				keccak256(abi.encode(gw.RELEASE_TYPEHASH(), ORDER, stranger, AMOUNT, QUOTE))
			)
		);
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, signDigest(senderPk, wrongTerms));
		wrongTerms = keccak256(
			abi.encodePacked(
				'\x19\x01',
				gw.DOMAIN_SEPARATOR(),
				keccak256(abi.encode(gw.RELEASE_TYPEHASH(), ORDER, lpPayout, AMOUNT - 1, QUOTE))
			)
		);
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settle(ORDER, signDigest(senderPk, wrongTerms));
		// Partial for one gross amount does not authorize another.
		vm.prank(stranger);
		vm.expectRevert(bytes('InvalidSignature'));
		gw.settlePartial(ORDER, 2, sigReleasePartial(senderPk, ORDER, 1), sigReleasePartial(lpPk, ORDER, 2));
		// A second OTCGateway (different verifying contract) rejects signatures made for the first.
		OTCGateway gw2 = new OTCGateway(owner, pauser, authSigner, arbiter, treasury, DISPUTE_DELAY);
		vm.prank(owner);
		gw2.setTokenSupported(address(usdc), true);
		IOTCGateway.LockAuth memory b = defaultAuth();
		bytes memory bSig = signAuth(b);
		vm.prank(sender);
		vm.expectRevert(bytes('InvalidAuthSignature'));
		gw2.lock(b, bSig);

		// The correctly bound signatures still work.
		vm.prank(stranger);
		gw.settle(ORDER, sigRelease(senderPk, ORDER));
		vm.prank(stranger);
		gw.settle(o2, sigRelease(senderPk, o2));
	}

	/* ==================================================================================== P1 (unit view) */

	function test_P1_solvencyHoldsAcrossMixedOutcomes() public {
		bytes32[4] memory ids = [keccak256('a'), keccak256('b'), keccak256('c'), keccak256('d')];
		IOTCGateway.LockAuth memory a = defaultAuth();
		for (uint256 i; i < ids.length; i++) {
			a.orderId = ids[i];
			lockAs(a);
		}
		vm.prank(sender);
		gw.settle(ids[0], '');
		vm.prank(lp);
		gw.markPaying(ids[1], '');
		vm.prank(sender);
		gw.cancel(ids[2], '');
		_assertSolvent();
		vm.warp(block.timestamp + DISPUTE_DELAY);
		vm.prank(arbiter);
		gw.arbitrate(ids[1], AMOUNT / 2);
		_assertSolvent();
		vm.prank(treasury);
		gw.withdrawFees(address(usdc));
		_assertSolvent();
		// only ids[3] is still open
		assertEq(bal(address(gw)), AMOUNT + gw.accruedFees(address(usdc)));
	}

	function _assertSolvent() internal view {
		uint256 open;
		bytes32[4] memory ids = [keccak256('a'), keccak256('b'), keccak256('c'), keccak256('d')];
		for (uint256 i; i < ids.length; i++) {
			IOTCGateway.Status s = status(ids[i]);
			if (s == IOTCGateway.Status.Locked || s == IOTCGateway.Status.Paying) open += gw.getLock(ids[i]).amount;
		}
		assertGe(bal(address(gw)), open + gw.accruedFees(address(usdc)));
	}
}
