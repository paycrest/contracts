<a href="https://solidity.readthedocs.io/en/v0.8.18/"><img alt="solidity v0.8.18" src="https://badgen.net/badge/solidity/v0.8.18/blue"></a>

# Paycrest Contracts
    
## Description

Paycrest contracts are multi-chain EVM-based smart contracts that facilitate the on-chain lifecycle of a payment order. They empower a sender to create a payment order, enable a liquidity provider to receive cryptocurrency in escrow, and much more.

![](https://lh7-rt.googleusercontent.com/docsz/AD_4nXd9vDhbrwj3ikJ9ghsVPc4qaZ7_RmgzNn3CjbW2jvAWepYYBmIat8Mtidid8OCBzuP7Sr-_zab6gjjpM6tSJm3p00akfR9xhkkzckDoZOhO9jiqgnO0EkZRyH4QoxgGAXRelCSNxQ?key=xfQ-CdRhtjGdAX7gL41tK8t-)

## Deployment

Deployment is done using Hardhat scripts

#### Deploy and verify upgradeable proxy contract

```bash
npx hardhat run scripts/deploy.ts --network <network>

npx hardhat verify --network <network> <contract_address>

# for Tron network,
tronbox migrate -f 1 --to 1 --network <network>
```

#### Upgrade proxy contract

```bash
npx hardhat run scripts/upgrade.ts --network <network>

# upgrade across all EVM chains
npx hardhat run scripts/upgrade.ts --network arbitrumOne && npx hardhat run scripts/upgrade.ts --network base && npx hardhat run scripts/upgrade.ts --network bsc && npx hardhat run scripts/upgrade.ts --network polygon && npx hardhat run scripts/upgrade.ts --network optimisticEthereum && npx hardhat run scripts/upgrade.ts --network scroll

# upgrade across all EVM testnet chains
npx hardhat run scripts/upgrade.ts --network arbitrumSepolia && npx hardhat run scripts/upgrade.ts --network amoy && npx hardhat run scripts/upgrade.ts --network baseSepolia && npx hardhat run scripts/upgrade.ts --network sepolia

# for Tron network,
tronbox migrate -f 2 --to 2 --network <network>
```

#### Owner configurations

Update network settings in `scripts/config.ts`

```bash
npx hardhat run scripts/setSupportedTokens.ts --network <network>

npx hardhat run scripts/updateProtocolAddresses.ts --network <network>

npx hardhat run scripts/updateProtocolFee.ts --network <network>

# for Tron network,
npx hardhat run scripts/tron/setSupportedTokens.ts

npx hardhat run scripts/tron/updateProtocolAddresses.ts

npx hardhat run scripts/tron/updateProtocolFee.ts
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
			<td rowspan="2">Ethereum Sepolia</td>
			<td>Gateway Proxy</td>
			<td>0x8d2C0D398832b814e3814802FF2dC8b8eF4381e5</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x0BC10d31B96838aD5783a0dd994fb16e14609e6E</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Polygon Amoy</td>
			<td>Gateway Proxy</td>
			<td>0xCAD53Ff499155Cc2fAA2082A85716322906886c2</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002ec87ba57fcf3f6b510f20d5a80a6c33a</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Arbitrum Sepolia</td>
			<td>Gateway Proxy</td>
			<td>0x87B321fc77A0fDD0ca1fEe7Ab791131157B9841A</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002Ec87ba57FCf3f6b510f20d5A80A6C33a</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Base Sepolia</td>
			<td>Gateway Proxy</td>
			<td>0x847dfdAa218F9137229CF8424378871A1DA8f625</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002Ec87ba57FCf3f6b510f20d5A80A6C33a</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Asset Chain Testnet</td>
			<td>Gateway Proxy</td>
			<td>0xBe6dE889795677736919A7880324A71Dc7dFa162</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x9519D63fbF9717Fa3419846eBA92B01Cd1d1D131</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Tron Shasta</td>
			<td>Gateway Proxy</td>
			<td>TYA8urq7nkN2yU7rJqAgwDShCusDZrrsxZ</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>TSGr6Ri7NZ7FxN1gCiWkn8cPA2qtF6ctdF</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>TNcogTDoWxpuv77WtsiNTRhqjRbZmmDLTR</td>
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
			<td rowspan="2">Ethereum</td>
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
			<td rowspan="2">Polygon</td>
			<td>Gateway Proxy</td>
			<td>0xfB411Cc6385Af50A562aFCb441864E9d541CDA67</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002ec87ba57fcf3f6b510f20d5a80a6c33a</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Base</td>
			<td>Gateway Proxy</td>
			<td>0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd28da2E11FCd2A9F44D5a4952430CE8b4f3Ee05f</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">BNB Smart Chain</td>
			<td>Gateway Proxy</td>
			<td>0x1FA0EE7F9410F6fa49B7AD5Da72Cf01647090028</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002ec87ba57fcf3f6b510f20d5a80a6c33a</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="2">Arbitrum One</td>
			<td>Gateway Proxy</td>
			<td>0xE8bc3B607CfE68F47000E3d200310D49041148Fc</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x8fd1f78d88dd008e557273b5cd517487c2a9a7de</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Optimism Ethereum</td>
			<td>Gateway Proxy</td>
			<td>0xD293fCd3dBc025603911853d893A4724CF9f70a0</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002Ec87ba57FCf3f6b510f20d5A80A6C33a</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>0xb9B5280AB99E48a9662D4740B1e1398abdf87b6D</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Scroll</td>
			<td>Gateway Proxy</td>
			<td>0x663C5BfE7d44bA946C2dd4b2D1Cf9580319F9338</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0xd2d97002ec87ba57fcf3f6b510f20d5a80a6c33a</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>0x16c9C78Dbb224889E3e2ADef991C8c4438ea797B</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Celo</td>
			<td>Gateway Proxy</td>
			<td>0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x8508c1C9f29BD1e73B5A9bD8FB87720927c681FA</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>0xc38D6817F736b1cb44785e14A8cb7152385d3210</td>
		</tr>
		<tr>
			<td rowspan="3">Lisk</td>
			<td>Gateway Proxy</td>
			<td>0xff0E00E0110C1FBb5315D276243497b66D3a4d8a</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x3Dc80272cE93cBFF3351913bB089B59C4a9141DE</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>0x8FD1f78d88Dd008E557273b5Cd517487C2A9A7de</td>
		</tr>
		<tr>
			<td rowspan="2">Asset Chain</td>
			<td>Gateway Proxy</td>
			<td>0xff0E00E0110C1FBb5315D276243497b66D3a4d8a</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>0x3Dc80272cE93cBFF3351913bB089B59C4a9141DE</td>
		</tr>
		<tr>
			<td colspan="3"></td>
		</tr>
		<tr>
			<td rowspan="3">Tron</td>
			<td>Gateway Proxy</td>
			<td>THyFP5ST9YyLZn6EzjKjFhZti6aKPgEXNU</td>
		</tr>
		<tr>
			<td>Gateway Implementation</td>
			<td>TDhBvHbnF8nN7YctokpdZAVPcmBx2Jrn2d</td>
		</tr>
		<tr>
			<td>Gateway Admin</td>
			<td>TLw6AW9khfwLVq5gq9uV71wTVZEPxKjoiZ</td>
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

## Contributing

We welcome contributions to the Paycrest gateway contract! To get started, follow these steps:

**Important:** Before you begin contributing, please ensure you've read and understood these important documents:

- [Contribution Guide](https://paycrest.notion.site/Contribution-Guide-1602482d45a2809a8930e6ad565c906a) - Critical information about development process, standards, and guidelines.

- [Code of Conduct](https://paycrest.notion.site/Contributor-Code-of-Conduct-1602482d45a2806bab75fd314b381f4c) - Our community standards and expectations.

Our team will review your pull request and work with you to get it merged into the main branch of the repository.

If you encounter any issues or have questions, feel free to open an issue on the repository or leave a message in our [developer community on Telegram](https://t.me/+Stx-wLOdj49iNDM0)

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
