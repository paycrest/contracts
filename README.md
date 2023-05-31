<p>
    <a href="https://solidity.readthedocs.io/en/v0.8.18/"><img alt="solidity v0.8.18" src="https://badgen.net/badge/solidity/v0.8.17/blue"></a>
    <img src="https://github.com/Vaultka-Project/sake-contracts/actions/workflows/hardhat.yml/badge.svg" alt="tests.yml">
</p>

# Paycrest
An escrow contract is a type of smart contract that holds cryptocurrency or other digital assets temporarily until a transaction is completed. It acts as an intermediary between the parties involved in the transaction, ensuring that the funds are secure and released to the appropriate parties at the appropriate time.

In the case of a cryptocurrency transaction, the escrow contract receives the agreed-upon amount of cryptocurrency from the sender and holds it until the provider fulfills the order and the recipient confirms that they have received the payment. Once the validator confirms the payment, the escrow contract sends the cryptocurrency to the seller's and validators' wallets.

- [ ] Escrow Contract
- [ ] Enable multiple currencies
# 
# Paycrest validator
A validator contract is a smart contract designed to reward transaction validators and enable them to stake cryptocurrency. Validators play an essential role in maintaining the paycrest protocol security and integrity by validating transactions.

In a validator contract, validators are incentivized to perform their duties correctly by earning rewards in the form of cryptocurrency. The contract uses a specific algorithm to determine which validator gets the transaction to validate, the validator's performance and allocate rewards accordingly.

The validator contract also enables validators to stake cryptocurrency, which means locking up a certain amount of cryptocurrency as collateral to guarantee their performance. Validators who perform their duties correctly and meet the contract's requirements will receive their staked cryptocurrency back, plus rewards for their services. Validators who fail to meet the contract's requirements may lose their staked cryptocurrency as a penalty.
This project demonstrates a basic Hardhat use case. and how the contract can be depolyed
# 
Try running some of the following tasks:

```shell
$ REPORT_GAS=true npx hardhat test
$ npx hardhat node
$ npx hardhat run deploy/paycrest.js
```

## Testing

Contract tests are defined under the tests directory. To run all the tests, run:

```bash
$ npx hardhat test
```

# Deployment

You can find a deployment utility with hardhat to easily deploy the smart contracts locally
&nbsp;

## How to deploy on Hardhat?

1. run the command below, list of tags will be added later, you can choos to use one of the available `--tags` if required.

```bash
$ npx hardhat deploy --network <network>
```

## BSC and Matic Testnet Contracts

<table>
  <thead>
    <tr>
      <th>Contracts</th>
      <th>Address</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Mock USDC</td>
      <td>0xe6123B5A202868cFe59d829b2E1F9A320B8E0f4A</td>
    </tr>
    <tr>
      <td>Paycrest</td>
      <td>0xd39074fe0B5A571b7F09F42C736a88b01298d70D</td>
    </tr>
    <tr>
      <td>Paycrest Validator</td>
      <td>0x92368Ad043cCe95b02F4F3beA9765Aa9caF3E070</td>
    </tr>
    <tr>
      <td></td>
      <td></td>
    </tr>
    </tr>
  </tbody>
</table>

## Tron Shasta Contracts

<table>
  <thead>
    <tr>
      <th>Contracts</th>
      <th>Address</th>
      <th>link</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Mock USDC</td>
      <td>TS9byD5hoYMc5jQTUj974wyxcKP3bMwpvf</td>
      <td>https://shasta.tronscan.org/#/contract/TS9byD5hoYMc5jQTUj974wyxcKP3bMwpvf/code</td>
    </tr>
    <tr>
      <td>Paycrest</td>
      <td>TVR1Rm6JKBBCBUu4hmgGGvqr2exQHQQ612</td>
      <td>https://shasta.tronscan.org/#/contract/TVR1Rm6JKBBCBUu4hmgGGvqr2exQHQQ612/code</td>
    </tr>
    <tr>
      <td>Paycrest Validator</td>
      <td>TBdCenqaMtHpvKSoUoLJJN5k6bxYbUtUyR</td>
      <td>https://shasta.tronscan.org/#/contract/TBdCenqaMtHpvKSoUoLJJN5k6bxYbUtUyR/code</td>
    </tr>
    <tr>
      <td></td>
      <td></td>
      <td></td>
    </tr>
    </tr>
  </tbody>
</table>

## **Commits and PRs**

This project uses Conventional Commits to generate release notes and to determine versioning. Commit messages should adhere to this standard and be of the form:

```bash
$ git commit -m "feat: Add new feature x"
$ git commit -m "fix: Fix bug in feature x"
$ git commit -m "docs: Add documentation for feature x"
$ git commit -m "test: Add test suite for feature x"
```

Further details on `conventional commits` can be found here: https://www.conventionalcommits.org/en/v1.0.0/

## Contributor ✨

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://onahprosperity.github.io/"><img src="https://avatars.githubusercontent.com/u/40717516?v=4?s=50" width="50px;" alt="Prosperity"/><br /><sub><b>Prosperity</b></sub></a><br /><a href="https://github.com/paycrest/contracts" title="code">💻</a></td>
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
