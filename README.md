<a href="https://solidity.readthedocs.io/en/v0.8.18/"><img alt="solidity v0.8.18" src="https://badgen.net/badge/solidity/v0.8.18/blue"></a>

# Paycrest Contracts
    
## Description

Paycrest contracts are multi-chain EVM-based smart contracts that facilitate the on-chain lifecycle of a payment order. They empower a sender to create a payment order, enable a liquidity provider to receive cryptocurrency in escrow, and much more.

## Deployment

Deployment is done using Hardhat scripts

#### Deploy and verify upgradeable proxy contract

```bash
npx hardhat run scripts/deploy.ts --network <network>

npx hardhat verify --network <network> <contract_address>
```

#### Upgrade proxy contract

```bash
npx hardhat run scripts/upgrade.ts --network <network>
```

#### Owner configurations

Update network settings, currencies, and supported institutions in `scripts/config.ts`

```bash
npx hardhat run scripts/setSupportedInstitutions.ts --network <network>

npx hardhat run scripts/setSupportedTokens.ts --network <network>

npx hardhat run scripts/updateProtocolAddress.ts --network <network>

npx hardhat run scripts/updateProtocolFee.ts --network <network>
```


## Testnet Contracts

<table>
	<thead>
		<tr>
			<th>Network</th>
			<th>Contracts</th>
			<th>Address</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td rowspan="3">Ethereum Sepolia</td>
			<td>Gateway Proxy</td>
			<td>0x16c9C78Dbb224889E3e2ADef991C8c4438ea797B</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xD293fCd3dBc025603911853d893A4724CF9f70a0</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Base Sepolia</td>
			<td>Gateway Proxy</td>
			<td>0x663C5BfE7d44bA946C2dd4b2D1Cf9580319F9338</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xD293fCd3dBc025603911853d893A4724CF9f70a0</td>
		</tr>
	</tbody>
</table>

## Mainnet Contracts

<table>
	<thead>
		<tr>
			<th>Network</th>
			<th>Contracts</th>
			<th>Address</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td rowspan="3">Ethereum</td>
			<td>Gateway Proxy</td>
			<td>0x16c9C78Dbb224889E3e2ADef991C8c4438ea797B</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xD293fCd3dBc025603911853d893A4724CF9f70a0</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Arbitrum, Polygon, Base, BNB Smart Chain</td>
			<td>Gateway Proxy</td>
			<td>0x663C5BfE7d44bA946C2dd4b2D1Cf9580319F9338</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xD293fCd3dBc025603911853d893A4724CF9f70a0</td>
		</tr>
	</tbody>
</table>

## Testing

Contract tests are defined under the tests directory. To run all the tests, run:

```bash
npx hardhat test
```

## **Commits and PRs**

This project uses Conventional Commits to generate release notes and to determine versioning. Commit messages should adhere to this standard and be of the form:

```bash
$ git commit -m "feat: Add new feature x"
$ git commit -m "fix: Fix bug in feature x"
$ git commit -m "docs: Add documentation for feature x"
$ git commit -m "test: Add test suite for feature x"
```

Further details on `conventional commits` can be found [here](https://www.conventionalcommits.org/en/v1.0.0/)

## Contributors ✨

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://onahprosperity.github.io/"><img src="https://avatars.githubusercontent.com/u/40717516?v=4?s=50" width="50px;" alt="Prosperity"/><br /><sub><b>Prosperity</b></sub></a><br /><a href="https://github.com/paycrest/contracts" title="code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://chibie.github.io/"><img src="https://avatars.githubusercontent.com/u/6025509?v=4" width="50px;" alt="chibie"/><br /><sub><b>chibie</b></sub></a><br /><a href="https://github.com/paycrest/contracts" title="code">💻</a></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td align="center" size="13px" colspan="7">
        <img src="https://raw.githubusercontent.com/all-contributors/all-contributors-cli/1b8533af435da9854653492b1327a23a4dbd0a10/assets/logo-small.svg">
          <a href="https://all-contributors.js.org/docs/en/bot/usage">Add your contributions</a>
        </img>
      </td>
    </tr>
  </tfoot>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## License
[Affero General Public License v3.0](https://choosealicense.com/licenses/agpl-3.0/)
