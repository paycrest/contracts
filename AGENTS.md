# AGENTS.md

How to work in paycrest/contracts, for AI coding agents and people alike. These contracts hold and route user
funds; when in doubt, stop and ask a maintainer.

## Setup

- Toolchain as CI pins it: Foundry v1.8.1, Node 22 with yarn (`yarn install --frozen-lockfile`), Python 3.12.
- `make verify-tools` once: the forge-std submodule and a `.venv` with Halmos and Slither from
  `requirements-verify.txt`. CI installs the hashed `requirements-verify.lock` and is the authority; if a local
  result disagrees with CI, compare the environments.
- `make help` lists every verification gate and its steps.

## Before you push

- Run the full gate of every contract you changed: `make gw-verify` (Gateway, GatewaySettingManager),
  `make bcs-verify` (BatchCallAndSponsor), or `make <name>-verify` from the contract's `<name>-verify.mk`. A gate
  is green only when all of it is: unit, fuzz and invariant tests, 100% line and branch coverage, Halmos,
  Slither (fails on medium or high), spec traceability and Hardhat parity; the Gateway gate also checks the
  storage layout.
- `npm run lint:sol` (prettier and solhint) and, for Gateway changes, `npx hardhat test`.
- A new contract gets its own spec, `<name>-verify.mk` and CI workflow; start from an existing gate.

## Specs and tests

- `docs/<contract>-spec.md` is the source of truth: numbered properties `P1`…`Pn`. Every property needs a test
  whose name carries its id (`test_P3_…`, `testFuzz_P3_…`, `invariant_P3_…`, `check_P3_…`), and
  `make *-traceability` enforces it. Change a property and its tests in the same commit.
- Foundry tests live in `test/foundry/`, Hardhat tests in `test/**/*.js`. Foundry output goes to `out/` and
  `cache_forge/`, never to Hardhat's `artifacts/` or `cache/`.
- When you add a check, show it matters: a test that fails without it (mutate the check and run the gate).
- Test against third parties' real bytecode where it exists (Safe, Zodiac and the like) rather than mocks.
  Bytecode fixtures are copies of canonical deployments: never edit them by hand, and pin them with a code-hash
  test.

## Files you don't edit

- Tracked files under `artifacts/` (ignored otherwise): `npx hardhat compile` and `make hardhat-parity` rewrite
  them. Restore with `git checkout -- artifacts/` before committing unless the change is the point.
- `.openzeppelin/*.json` and `deployments/`: records of live deployments, changed only alongside a real
  deployment or upgrade.
- Generated or vendored: `out/`, `cache*/`, `flattened/`, `typechain*`, `lib/`.

## Upgrades, deployments and keys

- Gateway is upgraded in place behind a proxy: never reorder, remove or retype storage in `Gateway` or
  `GatewaySettingManager`. Append new variables and shrink that contract's `__gap` by the slots they take;
  `make gw-storage-layout` checks the layout against every recorded implementation.
- Agents don't deploy, upgrade or transfer ownership: no `ignition deploy`, `upgrade:all-evm` or
  `transfer-ownership:all-evm` against a live network (dry runs only when asked). Maintainers deploy.
- Never commit private keys, mnemonics, `.env` files or RPC URLs that carry keys.

## Security

- A suspected vulnerability in deployed or `main` code is handled as `SECURITY.md` says: privately. Don't
  describe it in a public issue, PR, commit message, branch name or comment; tell a maintainer.

## Commits and pull requests

- Conventional Commits with the Jira key: `feat(treasury): on-chain co-signature deadline (KAN-1042)`. One
  logical change per commit.
- No AI co-author trailers in commits and no AI attribution in PR titles or descriptions.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md`, including which gates you ran and anything not tested.
- Don't force-push shared branches; bring `main` in with a merge rather than a rebase.
