<p>
    <a href="https://solidity.readthedocs.io/en/v0.8.18/"><img alt="solidity v0.8.18" src="https://badgen.net/badge/solidity/v0.8.17/blue"></a>
    <img src="https://github.com/Vaultka-Project/sake-contracts/actions/workflows/hardhat.yml/badge.svg" alt="tests.yml">
</p>

# Paycrest

This project demonstrates a basic Hardhat use case. and how the contract can be depolyed

Try running some of the following tasks:

```shell
$ REPORT_GAS=true npx hardhat test
$ npx hardhat node
$ npx hardhat run scripts/deploy.js
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
$ npx hardhat deploy --network local --tags <options> --reset
```

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
