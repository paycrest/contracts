# OTCGateway verification harness.
#
#   make otc-tools    one-time: Foundry check, forge-std submodule, python venv with halmos + slither
#   make otc-verify   the single required gate: build, unit+fuzz, invariants, coverage, halmos, slither,
#                     property traceability, hardhat artifact parity
#
# CI runs `FOUNDRY_PROFILE=ci make otc-verify` (see .github/workflows/otc-verify.yml).

SHELL := /bin/bash
.DEFAULT_GOAL := help

VENV        ?= .venv
PY          ?= python3
FORGE       ?= forge
HALMOS      := $(if $(wildcard $(VENV)/bin/halmos),$(VENV)/bin/halmos,halmos)
SLITHER     := $(if $(wildcard $(VENV)/bin/slither),$(VENV)/bin/slither,slither)
OTC_MATCH   ?= test/foundry/OTCGateway*
OTC_SRC     := contracts/OTCGateway.sol
COVERAGE_MIN?= 100

.PHONY: help otc-tools otc-build otc-test otc-invariants otc-coverage otc-halmos otc-slither \
        otc-traceability otc-hardhat-parity otc-verify otc-mutation

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-20s %s\n", $$1, $$2}'

otc-tools: ## Install/verify local toolchain (forge on PATH, forge-std submodule, venv with halmos+slither)
	@command -v $(FORGE) >/dev/null || { echo "forge not found: brew install foundry (or foundryup)"; exit 1; }
	@$(FORGE) --version
	@test -f lib/forge-std/src/Test.sol || { echo "installing forge-std"; git submodule update --init --recursive; test -f lib/forge-std/src/Test.sol || $(FORGE) install foundry-rs/forge-std; }
	@test -x $(VENV)/bin/pip || $(PY) -m venv $(VENV)
	@$(VENV)/bin/pip install --quiet --upgrade pip
	@$(VENV)/bin/pip install --quiet -r requirements-otc.txt
	@$(HALMOS) --version && $(SLITHER) --version

otc-build: ## forge build (whole contracts/ tree, proves Hardhat + Foundry coexist)
	$(FORGE) build

otc-test: otc-build ## Unit + fuzz tests for the harness and OTCGateway
	$(FORGE) test --match-path 'test/foundry/*' --no-match-path '*invariants*' -vv

otc-invariants: otc-build ## Handler-based invariant suite
	@if ls test/foundry/*invariants* >/dev/null 2>&1; then $(FORGE) test --match-path '*invariants*' -vv; else echo "no invariant suite yet (lands in C2)"; fi

otc-coverage: otc-build ## 100% line+branch coverage gate on contracts/OTCGateway.sol
	@if [ -f $(OTC_SRC) ]; then \
	  $(FORGE) coverage --match-path 'test/foundry/*' --no-match-coverage '(^test/|^lib/|contracts/mocks/|contracts/Gateway\.sol|contracts/GatewaySettingManager|contracts/ProviderBatchCallAndSponsor)' --report summary --report lcov | tee coverage-summary.txt; \
	  scripts/check-otc-coverage.sh coverage-summary.txt $(OTC_SRC) $(COVERAGE_MIN); \
	else echo "coverage gate skipped: $(OTC_SRC) not present yet (lands in C2)"; fi

otc-halmos: ## Bounded symbolic checks (functions prefixed check_)
	@# Foundry's cache does not key on --ast; a plain build leaves artifacts Halmos cannot parse, so force one.
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

otc-slither: ## Static analysis; fails on medium or high findings in OTCGateway sources
	@if [ -f $(OTC_SRC) ]; then \
	  $(SLITHER) $(OTC_SRC) --config-file slither.config.json --fail-medium; \
	else \
	  echo "slither: $(OTC_SRC) not present yet (lands in C2); analysing the repo so the toolchain is still exercised"; \
	  $(SLITHER) . --config-file slither.config.json --fail-medium; \
	fi

otc-traceability: ## Every P-id in docs/otc-gateway-spec.md must have a named test
	scripts/check-otc-traceability.sh

otc-hardhat-parity: ## Hardhat still compiles the same sources (ignition/typechain/abigen consumers)
	npx hardhat compile

otc-verify: otc-build otc-test otc-invariants otc-coverage otc-halmos otc-slither otc-traceability otc-hardhat-parity ## Full one-click gate
	@echo "otc-verify: all gates green"

otc-mutation: otc-build ## Optional, non-gating: mutation testing report for OTCGateway.sol (needs gambit on PATH)
	@command -v gambit >/dev/null || { echo "gambit not installed; see https://github.com/Certora/gambit"; exit 0; }
	gambit mutate --filename $(OTC_SRC) --solc_remappings "@openzeppelin/=node_modules/@openzeppelin/" && \
	echo "mutants written to gambit_out/; run 'forge test' against each to measure kill rate"
