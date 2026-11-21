// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {TreasuryBase, ISafe, TestToken} from '../test/foundry/TreasuryBase.sol';
import {TreasuryGuard} from '../contracts/TreasuryGuard.sol';
import {Operation} from '../contracts/interfaces/ISafe.sol';

/**
 * Writes test/vectors/treasury-safe-tx.json: Safe v1.4.1 transactions on a treasury built from the real Safe
 * bytecode, with the Safe's own hash, the packed signatures it accepted and the execTransaction calldata, so the
 * aggregator's keeper encoding (services/wallets, KAN-1042) can be checked against the deployed contracts. Each
 * vector's signatures end with the co-signer's deadline attestation (P16), with the deadline and its digest
 * written alongside.
 *
 *   forge script script/TreasuryVectors.s.sol
 *
 * Every vector is executed here; a vector is only written if the Safe and the guard accepted it.
 */
contract TreasuryVectors is TreasuryBase {
	uint256 internal count;
	string internal all = 'vectors';
	string internal allJson;

	function run() external {
		setUp();
		_vector('eth transfer, EOA member + co-signer (ECDSA)', _signers(_s(member), _s(cosigner)), _tx(recipient, 1 ether, '', Operation.Call));
		_vector(
			'token transfer, passkey member (contract signature) + co-signer',
			_signers(_s(address(passkey)), _s(cosigner)),
			_tx(address(token), 0, _transferData(recipient, 250e6), Operation.Call)
		);
		_vector(
			'guard call, member + co-signer (eth_sign)',
			_signers(_s(member), _s(cosigner, Kind.EthSign)),
			_tx(address(guard), 0, abi.encodeCall(TreasuryGuard.setCosigner, (cosigner)), Operation.Call)
		);
		SafeTx memory paid = _tx(recipient, 0.5 ether, hex'c0ffee', Operation.Call);
		paid.safeTxGas = 100_000;
		paid.baseGas = 21_000;
		paid.gasPrice = 1;
		paid.refundReceiver = keeper;
		_vector('eth transfer with Safe gas refund fields set', _signers(_s(member), _s(cosigner)), paid);

		string memory meta = 'meta';
		vm.serializeString(meta, 'source', 'contracts/script/TreasuryVectors.s.sol on Safe v1.4.1 (SafeL2) + TreasuryGuard');
		vm.serializeUint(meta, 'chainId', block.chainid);
		vm.serializeAddress(meta, 'safe', address(treasury));
		vm.serializeAddress(meta, 'member', member);
		vm.serializeAddress(meta, 'cosigner', cosigner);
		vm.serializeAddress(meta, 'passkey', address(passkey));
		string memory out = vm.serializeString(meta, 'vectors', allJson);
		vm.writeJson(out, string.concat(vm.projectRoot(), '/test/vectors/treasury-safe-tx.json'));
	}

	function _tx(address to, uint256 value, bytes memory data, Operation op) internal view returns (SafeTx memory) {
		return SafeTx(to, value, data, op, 0, 0, 0, address(0), address(0), treasury.nonce());
	}

	function _vector(string memory name, Signer[] memory signers, SafeTx memory t) internal {
		t.nonce = treasury.nonce();
		bytes32 h = _txHash(treasury, t);
		uint256 deadline = block.timestamp + COSIGN_TTL;
		bytes memory sigs = bytes.concat(_signFull(signers, t), _attestation(cosignerPk, h, deadline));
		bytes memory execData = _flat(ISafe.execTransaction.selector, abi.encode(ExecArgs(t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, sigs)));
		vm.prank(keeper, keeper);
		(bool ok, ) = address(treasury).call(execData);
		require(ok && treasury.nonce() == t.nonce + 1, name);

		string memory k = string.concat('v', vm.toString(count++));
		vm.serializeString(k, 'name', name);
		vm.serializeAddress(k, 'to', t.to);
		vm.serializeUint(k, 'value', t.value);
		vm.serializeBytes(k, 'data', t.data);
		vm.serializeUint(k, 'operation', uint256(t.operation));
		vm.serializeUint(k, 'safeTxGas', t.safeTxGas);
		vm.serializeUint(k, 'baseGas', t.baseGas);
		vm.serializeUint(k, 'gasPrice', t.gasPrice);
		vm.serializeAddress(k, 'gasToken', t.gasToken);
		vm.serializeAddress(k, 'refundReceiver', t.refundReceiver);
		vm.serializeUint(k, 'nonce', t.nonce);
		vm.serializeBytes32(k, 'safeTxHash', h);
		vm.serializeUint(k, 'deadline', deadline);
		vm.serializeBytes32(k, 'deadlineDigest', guard.deadlineDigest(h, deadline));
		vm.serializeBytes(k, 'signatures', sigs);
		string memory v = vm.serializeBytes(k, 'execTransactionCalldata', execData);
		allJson = vm.serializeString(all, k, v);
	}

	struct ExecArgs {
		address to;
		uint256 value;
		bytes data;
		Operation operation;
		uint256 safeTxGas;
		uint256 baseGas;
		uint256 gasPrice;
		address gasToken;
		address refundReceiver;
		bytes signatures;
	}

	/// `_sign` for a transaction with any gas fields (TreasuryBase's `_sign` uses zero gas fields).
	function _signFull(Signer[] memory signers, SafeTx memory t) internal returns (bytes memory) {
		uint256 n = signers.length;
		for (uint256 i = 1; i < n; ++i) {
			for (uint256 j = i; j > 0 && signers[j - 1].owner > signers[j].owner; --j) {
				(signers[j - 1], signers[j]) = (signers[j], signers[j - 1]);
			}
		}
		bytes32 h = _txHash(treasury, t);
		bytes memory txData = abi.decode(_safeView(treasury, ISafe.encodeTransactionData.selector, t), (bytes));
		bytes memory statics;
		bytes memory dynamics;
		for (uint256 i = 0; i < n; ++i) {
			(bytes memory st, bytes memory dyn) = _part(treasury, signers[i], h, txData, n * 65 + dynamics.length);
			statics = bytes.concat(statics, st);
			dynamics = bytes.concat(dynamics, dyn);
		}
		return bytes.concat(statics, dynamics);
	}
}
