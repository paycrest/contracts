# TreasuryGuard + TreasurySetup verification gate (KAN-1042), included from the Makefile.
#
#   make treasury-verify   build, unit+fuzz+integration (real Safe v1.4.1 and Zodiac Delay 1.0.0 bytecode),
#                          invariants, 100% coverage, halmos, slither, traceability, vectors, hardhat parity,
#                          against docs/treasury-guard-spec.md
#
# Shared toolchain from the Makefile (FORGE, HALMOS, SLITHER, COVERAGE_MIN). CI: .github/workflows/treasury-verify.yml.

TREASURY_GUARD_SRC := contracts/TreasuryGuard.sol
TREASURY_SETUP_SRC := contracts/TreasurySetup.sol
TREASURY_SPEC      := docs/treasury-guard-spec.md
TREASURY_TESTS     := test/foundry/TreasuryGuard*
TREASURY_COVERAGE_SUMMARY := cache_forge/treasury-coverage-summary.txt
# Everything but the two treasury contracts is excluded from their coverage figure.
TREASURY_COVERAGE_EXCLUDE := (^test/|^lib/|contracts/mocks/|contracts/interfaces/|contracts/Gateway\.sol|contracts/GatewaySettingManager|contracts/ProviderBatchCallAndSponsor|contracts/BatchCallAndSponsor)

.PHONY: treasury-test treasury-invariants treasury-coverage treasury-halmos treasury-slither treasury-traceability treasury-vectors treasury-verify

treasury-test: verify-build ## Treasury unit, fuzz and integration tests
	$(FORGE) test --match-path '$(TREASURY_TESTS)' --no-match-path '*invariants*' -vv

treasury-invariants: verify-build ## Treasury handler-based invariant suite
	$(FORGE) test --match-path 'test/foundry/TreasuryGuard.invariants.t.sol' -vv

treasury-coverage: verify-build ## 100% line+branch coverage gate on TreasuryGuard.sol and TreasurySetup.sol
	@mkdir -p $(dir $(TREASURY_COVERAGE_SUMMARY))
	$(FORGE) coverage --match-path '$(TREASURY_TESTS)' --no-match-coverage '$(TREASURY_COVERAGE_EXCLUDE)' --report summary | tee $(TREASURY_COVERAGE_SUMMARY)
	scripts/check-coverage.sh $(TREASURY_COVERAGE_SUMMARY) $(TREASURY_GUARD_SRC) $(COVERAGE_MIN)
	scripts/check-coverage.sh $(TREASURY_COVERAGE_SUMMARY) $(TREASURY_SETUP_SRC) $(COVERAGE_MIN)

treasury-halmos: ## TreasuryGuard bounded symbolic checks (check_ functions in TreasuryGuardHalmos)
	@# Foundry's cache does not key on --ast; a plain build leaves artifacts Halmos cannot parse, so force one.
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-contract '^TreasuryGuardHalmos$$' --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

treasury-slither: ## Static analysis of the treasury contracts; fails on medium or high findings
	$(SLITHER) $(TREASURY_GUARD_SRC) --config-file slither.config.json --fail-medium
	$(SLITHER) $(TREASURY_SETUP_SRC) --config-file slither.config.json --fail-medium

treasury-traceability: ## Every P-id in docs/treasury-guard-spec.md has a named treasury test
	scripts/check-spec-traceability.sh $(TREASURY_SPEC) '$(TREASURY_TESTS).sol'

treasury-vectors: verify-build ## The keeper vectors still match what the real Safe and the guard execute
	$(FORGE) script script/TreasuryVectors.s.sol >/dev/null
	git diff --exit-code -- test/vectors/treasury-safe-tx.json

treasury-verify: verify-build treasury-test treasury-invariants treasury-coverage treasury-halmos treasury-slither treasury-traceability treasury-vectors hardhat-parity ## Full gate for the treasury contracts
	@echo "treasury-verify: all gates green"
