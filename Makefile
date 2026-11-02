# OTCGateway verification harness.
#
#   make otc-tools    one-time: Foundry check, forge-std submodule, python venv with halmos + slither
#   make otc-verify   the single required gate: build, unit+fuzz, invariants, coverage, halmos, slither,
#                     property traceability, hardhat artifact parity
#
# CI runs `FOUNDRY_PROFILE=ci make otc-verify` (see .github/workflows/otc-verify.yml).
#
# BatchCallAndSponsor (the EIP-7702 delegate, KAN-943) uses the same toolchain and gates:
#   make bcs-verify   build, unit+fuzz, invariants, 100% coverage, halmos, slither, traceability, hardhat parity
# against docs/batch-call-and-sponsor-spec.md. CI runs it in the same workflow.

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
BCS_SRC     := contracts/BatchCallAndSponsor.sol
BCS_SPEC    := docs/batch-call-and-sponsor-spec.md
BCS_TESTS   := test/foundry/BatchCallAndSponsor*
# Everything but BatchCallAndSponsor.sol is excluded from its coverage figure.
BCS_COVERAGE_EXCLUDE := (^test/|^lib/|contracts/mocks/|contracts/Gateway\.sol|contracts/GatewaySettingManager|contracts/ProviderBatchCallAndSponsor|contracts/OTCGateway)

.PHONY: help otc-tools otc-build otc-test otc-invariants otc-coverage otc-halmos otc-slither \
        otc-traceability otc-hardhat-parity otc-verify otc-mutation \
        bcs-test bcs-invariants bcs-coverage bcs-halmos bcs-slither bcs-traceability bcs-verify bcs-mutation

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-20s %s\n", $$1, $$2}'

otc-tools: ## Install/verify local toolchain (forge on PATH, forge-std submodule, venv with halmos+slither)
	@command -v $(FORGE) >/dev/null || { echo "forge not found: brew install foundry (or foundryup)"; exit 1; }
	@$(FORGE) --version
	@test -f lib/forge-std/src/Test.sol || { echo "installing forge-std"; git submodule update --init --recursive; test -f lib/forge-std/src/Test.sol || $(FORGE) install foundry-rs/forge-std; }
	@test -x $(VENV)/bin/pip || $(PY) -m venv $(VENV)
	@$(VENV)/bin/pip install --quiet --upgrade pip
	@# Local convenience installs the two pinned tools and lets their dependencies resolve for
	@# whatever interpreter you have. CI is the authority and installs requirements-otc.lock with
	@# --require-hashes; if a local result ever disagrees with CI, trust CI and compare the two.
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

# ---------------------------------------------------------------------------------------------------------------
# BatchCallAndSponsor (KAN-943)

bcs-test: otc-build ## BatchCallAndSponsor unit + fuzz tests
	$(FORGE) test --match-path '$(BCS_TESTS)' --no-match-path '*invariants*' -vv

bcs-invariants: otc-build ## BatchCallAndSponsor handler-based invariant suite
	$(FORGE) test --match-path 'test/foundry/BatchCallAndSponsor.invariants.t.sol' -vv

bcs-coverage: otc-build ## 100% line+branch coverage gate on contracts/BatchCallAndSponsor.sol
	$(FORGE) coverage --match-path '$(BCS_TESTS)' --no-match-coverage '$(BCS_COVERAGE_EXCLUDE)' --report summary | tee bcs-coverage-summary.txt
	scripts/check-otc-coverage.sh bcs-coverage-summary.txt $(BCS_SRC) $(COVERAGE_MIN)

bcs-halmos: ## BatchCallAndSponsor bounded symbolic checks (check_ functions in BatchCallAndSponsorHalmos)
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-contract '^BatchCallAndSponsorHalmos$$' --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

bcs-slither: ## Static analysis of BatchCallAndSponsor.sol; fails on medium or high findings
	$(SLITHER) $(BCS_SRC) --config-file slither.config.json --fail-medium

bcs-traceability: ## Every P-id in docs/batch-call-and-sponsor-spec.md has a named BatchCallAndSponsor test
	scripts/check-spec-traceability.sh $(BCS_SPEC) '$(BCS_TESTS).sol'

bcs-verify: otc-build bcs-test bcs-invariants bcs-coverage bcs-halmos bcs-slither bcs-traceability otc-hardhat-parity ## Full gate for BatchCallAndSponsor
	@echo "bcs-verify: all gates green"

bcs-mutation: otc-build ## Optional, non-gating: mutation report for BatchCallAndSponsor.sol (needs gambit on PATH)
	@command -v gambit >/dev/null || { echo "gambit not installed; see https://github.com/Certora/gambit"; exit 0; }
	gambit mutate --filename $(BCS_SRC) --solc_remappings "@openzeppelin/=node_modules/@openzeppelin/" && \
	echo "mutants written to gambit_out/; run 'forge test --match-path $(BCS_TESTS)' against each to measure kill rate"
