// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from 'forge-std/Test.sol';
import {SignatureChecker} from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Gateway} from '../../contracts/Gateway.sol';

/**
 * @dev Thin wrapper around the exact OpenZeppelin signature path OTCGateway will use, so the harness can prove
 * (once, in PR C1) that Halmos reasons about `SignatureChecker` symbolically before the real contract lands.
 */
contract SignatureProbe {
	function isValid(address signer, bytes32 digest, bytes calldata signature) external view returns (bool) {
		return SignatureChecker.isValidSignatureNow(signer, digest, signature);
	}
}

/**
 * @title HarnessTest
 * @notice Permanent smoke tests for the verification harness itself:
 *  - Foundry compiles the retail Gateway with OpenZeppelin 4.9 (plain + upgradeable) resolved from node_modules,
 *    and deploys it behind a Transparent proxy the same way `test/fixtures/gateway.js` does under Hardhat.
 *  - Foundry fuzzing and Halmos symbolic execution both handle OZ `SignatureChecker` (EOA path).
 * Any break here means the toolchain, not the OTC contract, regressed.
 */
contract HarnessTest is Test {

	SignatureProbe internal probe;

	function setUp() public {
		probe = new SignatureProbe();
	}

	/* ---------------------------------------------------------------- coexistence */

	function test_harness_deploysRetailGatewayBehindTransparentProxy() public {
		Gateway impl = new Gateway();
		ProxyAdmin admin = new ProxyAdmin();
		bytes memory initData = abi.encodeCall(Gateway.initialize, ());
		TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(address(impl), address(admin), initData);
		Gateway gateway = Gateway(address(proxy));

		// initialize() ran through the proxy: owner is the deployer, aggregator not yet configured.
		assertEq(gateway.owner(), address(this));
		assertEq(gateway.getAggregator(), address(0));
		assertFalse(gateway.paused());
	}

	/* ---------------------------------------------------------------- SignatureChecker: fuzz */

	function testFuzz_harness_signatureCheckerAcceptsSigner(uint256 pk, bytes32 digest) public view {
		pk = bound(pk, 1, SECP256K1_ORDER - 1);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		assertTrue(probe.isValid(vm.addr(pk), digest, abi.encodePacked(r, s, v)));
	}

	function testFuzz_harness_signatureCheckerRejectsOtherSigner(uint256 pk, bytes32 digest, address other) public view {
		pk = bound(pk, 1, SECP256K1_ORDER - 1);
		vm.assume(other != vm.addr(pk));
		vm.assume(uint160(other) > 0xff); // see the Halmos twin below: precompiles answer staticcalls
		vm.assume(other.code.length == 0);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		assertFalse(probe.isValid(other, digest, abi.encodePacked(r, s, v)));
	}

	/* ---------------------------------------------------------------- SignatureChecker: Halmos */

	/// @dev Halmos runs every `check_` function symbolically; these mirror the fuzz cases for all inputs.
	function check_harness_signatureCheckerAcceptsSigner(uint256 pk, bytes32 digest) public view {
		vm.assume(pk > 0 && pk < SECP256K1_ORDER);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		vm.assume(uint256(s) <= SECP256K1_ORDER / 2 && (v == 27 || v == 28)); // real signers are low-s
		vm.assume(vm.addr(pk) != address(0)); // no real key maps to the zero address
		assert(probe.isValid(vm.addr(pk), digest, abi.encodePacked(r, s, v)));
	}

	function check_harness_signatureCheckerRejectsOtherSigner(uint256 pk, bytes32 digest, address other) public view {
		vm.assume(pk > 0 && pk < SECP256K1_ORDER);
		vm.assume(other != vm.addr(pk));
		// Precompiles have no code but answer staticcalls: the identity precompile (0x04) echoes calldata, which
		// OZ's ERC-1271 fallback reads as the magic value whenever the digest has 28 leading zero bytes. Real
		// signers are never precompiles, so exclude 0x00..0xff.
		vm.assume(uint160(other) > 0xff);
		vm.assume(other.code.length == 0);
		(uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
		vm.assume(uint256(s) <= SECP256K1_ORDER / 2 && (v == 27 || v == 28));
		assert(!probe.isValid(other, digest, abi.encodePacked(r, s, v)));
	}
}
