// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import '@openzeppelin/contracts/proxy/Clones.sol';
import {ISafeSetup, ISafeProxyFactory, IDelay} from './interfaces/ISafe.sol';
import {TreasuryGuard} from './TreasuryGuard.sol';

/**
 * @title TreasurySetup
 *
 * One-time setup for a Paycrest company treasury (KAN-925, KAN-1042), run by a new Safe through the `to`/`data`
 * delegatecall of `Safe.setup`. In the treasury's own context it:
 *
 *  1. deploys the recovery timelock: a Zodiac Delay 1.0.0 clone owned by the treasury, with the treasury as
 *     avatar and target, at an address derived from the treasury's address;
 *  2. deploys the recovery Safe: the business's admins with a majority threshold and no guard, which can queue
 *     transactions on the timelock, and which has the treasury enabled as a module so the normal path can keep
 *     its owners in step with the team. Its address is public (factory, singleton, `recoveryInitializer`, the
 *     treasury's address as salt) and the factory does not salt with the caller, so anyone can deploy it first;
 *     an existing recovery Safe at that address is then reused (CREATE2 means only the factory, with exactly this
 *     initializer and singleton, can have put it there) as long as it still has the treasury enabled as a module;
 *  3. enables the timelock as a module of the treasury, so a queued transaction runs after the cooldown;
 *  4. sets `TreasuryGuard` as the treasury's guard and registers the Paycrest co-signer with it.
 *
 * Everything is derived from the treasury's own address and the arguments in its initializer, so the same
 * initializer gives the same treasury, timelock and recovery Safe addresses on every network where the Safe
 * contracts sit at their canonical addresses.
 *
 * Holds no state and must only be delegatecalled.
 */
contract TreasurySetup {
	/// @notice Recovery settings and the contracts a treasury is built from.
	struct Config {
		/// TreasuryGuard deployment.
		address guard;
		/// Paycrest co-signer key; must be one of the treasury's owners.
		address cosigner;
		/// Zodiac Delay 1.0.0 mastercopy.
		address delayMastercopy;
		/// Seconds between queueing a recovery transaction and running it.
		uint256 recoveryCooldown;
		/// Seconds a recovery transaction stays executable after the cooldown (0 = forever, else >= 60).
		uint256 recoveryExpiration;
		/// Safe v1.4.1 proxy factory, singleton and fallback handler for the recovery Safe.
		address safeProxyFactory;
		address safeSingleton;
		address fallbackHandler;
		/// The admins' signers (passkey signer contracts) and how many of them recovery needs.
		address[] recoveryOwners;
		uint256 recoveryThreshold;
	}

	/// @notice Salt of the timelock clone; the deployer is the treasury, so the address is per treasury.
	bytes32 public constant DELAY_SALT = keccak256('paycrest.treasury.delay');

	address private immutable _self;

	/// @notice Called other than through a delegatecall.
	error OnlyDelegateCall();
	/// @notice The treasury's threshold is below 2.
	error TreasuryThresholdTooLow(uint256 threshold);
	/// @notice A recovery Safe already deployed at the treasury's recovery address no longer has the treasury as a
	/// module (its admins removed it), so it can't be wired in.
	error RecoveryNotWired(address recovery);

	constructor() {
		_self = address(this);
	}

	modifier onlyDelegateCall() {
		if (address(this) == _self) revert OnlyDelegateCall();
		_;
	}

	/// @notice The treasury setup; `data` of the treasury's `Safe.setup`.
	function setupTreasury(Config calldata c) external onlyDelegateCall {
		ISafeSetup treasury = ISafeSetup(address(this));
		uint256 threshold = treasury.getThreshold();
		if (threshold < 2) revert TreasuryThresholdTooLow(threshold);

		address delay = Clones.cloneDeterministic(c.delayMastercopy, DELAY_SALT);
		IDelay(delay).setUp(abi.encode(address(this), address(this), address(this), c.recoveryCooldown, c.recoveryExpiration));

		bytes memory init = recoveryInitializer(address(this), c.recoveryOwners, c.recoveryThreshold, c.fallbackHandler);
		uint256 salt = uint256(uint160(address(this)));
		address recovery = predictRecovery(c.safeProxyFactory, c.safeSingleton, init, salt);
		if (recovery.code.length == 0) {
			recovery = ISafeProxyFactory(c.safeProxyFactory).createProxyWithNonce(c.safeSingleton, init, salt);
		} else if (!ISafeSetup(recovery).isModuleEnabled(address(this))) {
			// Deployed ahead of the treasury (by anyone): reuse it only while it is still wired to the treasury.
			revert RecoveryNotWired(recovery);
		}
		IDelay(delay).enableModule(recovery);

		treasury.enableModule(delay);
		treasury.setGuard(c.guard);
		TreasuryGuard(c.guard).setCosigner(c.cosigner);
	}

	/// @notice The Safe v1.4.1 factory's CREATE2 address for a proxy of `singleton` set up with `initializer` and
	/// `saltNonce` (`SafeProxyFactory.createProxyWithNonce`).
	function predictRecovery(
		address factory,
		address singleton,
		bytes memory initializer,
		uint256 saltNonce
	) public pure returns (address) {
		bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
		bytes32 initCodeHash = keccak256(abi.encodePacked(ISafeProxyFactory(factory).proxyCreationCode(), uint256(uint160(singleton))));
		return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), factory, salt, initCodeHash)))));
	}

	/// @notice The recovery Safe's setup: enables the treasury as its module. `data` of the recovery Safe's `Safe.setup`.
	function setupRecovery(address treasury) external onlyDelegateCall {
		ISafeSetup(address(this)).enableModule(treasury);
	}

	/// @notice The recovery Safe's `Safe.setup` calldata for `treasury`.
	function recoveryInitializer(
		address treasury,
		address[] calldata owners,
		uint256 threshold,
		address fallbackHandler
	) public view returns (bytes memory) {
		return
			abi.encodeCall(
				ISafeSetup.setup,
				(
					owners,
					threshold,
					_self,
					abi.encodeCall(TreasurySetup.setupRecovery, (treasury)),
					fallbackHandler,
					address(0),
					0,
					payable(address(0))
				)
			);
	}
}
