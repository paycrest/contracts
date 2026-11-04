# BatchCallAndSponsor verification gate (KAN-943), included from the Makefile.
#
#   make bcs-verify      build, unit+fuzz, invariants, 100% coverage, halmos, slither, traceability,
#                        hardhat parity, against docs/batch-call-and-sponsor-spec.md
#
# Shared toolchain from the Makefile (FORGE, HALMOS, SLITHER, COVERAGE_MIN). CI: .github/workflows/bcs-verify.yml.

BCS_SRC     := contracts/BatchCallAndSponsor.sol
BCS_SPEC    := docs/batch-call-and-sponsor-spec.md
BCS_TESTS   := test/foundry/BatchCallAndSponsor*
BCS_COVERAGE_SUMMARY := cache_forge/bcs-coverage-summary.txt
# Everything but BatchCallAndSponsor.sol is excluded from its coverage figure.
BCS_COVERAGE_EXCLUDE := (^test/|^lib/|contracts/mocks/|contracts/interfaces/|contracts/Gateway\.sol|contracts/GatewaySettingManager|contracts/ProviderBatchCallAndSponsor)

.PHONY: bcs-test bcs-invariants bcs-coverage bcs-halmos bcs-slither bcs-traceability bcs-verify bcs-mutation

bcs-test: verify-build ## BatchCallAndSponsor unit + fuzz tests
	$(FORGE) test --match-path '$(BCS_TESTS)' --no-match-path '*invariants*' -vv

bcs-invariants: verify-build ## BatchCallAndSponsor handler-based invariant suite
	$(FORGE) test --match-path 'test/foundry/BatchCallAndSponsor.invariants.t.sol' -vv

bcs-coverage: verify-build ## 100% line+branch coverage gate on contracts/BatchCallAndSponsor.sol
	@mkdir -p $(dir $(BCS_COVERAGE_SUMMARY))
	$(FORGE) coverage --match-path '$(BCS_TESTS)' --no-match-coverage '$(BCS_COVERAGE_EXCLUDE)' --report summary | tee $(BCS_COVERAGE_SUMMARY)
	scripts/check-coverage.sh $(BCS_COVERAGE_SUMMARY) $(BCS_SRC) $(COVERAGE_MIN)

bcs-halmos: ## BatchCallAndSponsor bounded symbolic checks (check_ functions in BatchCallAndSponsorHalmos)
	@# Foundry's cache does not key on --ast; a plain build leaves artifacts Halmos cannot parse, so force one.
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-contract '^BatchCallAndSponsorHalmos$$' --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

bcs-slither: ## Static analysis of BatchCallAndSponsor.sol; fails on medium or high findings
	$(SLITHER) $(BCS_SRC) --config-file slither.config.json --fail-medium

bcs-traceability: ## Every P-id in docs/batch-call-and-sponsor-spec.md has a named BatchCallAndSponsor test
	scripts/check-spec-traceability.sh $(BCS_SPEC) '$(BCS_TESTS).sol'

bcs-verify: verify-build bcs-test bcs-invariants bcs-coverage bcs-halmos bcs-slither bcs-traceability hardhat-parity ## Full gate for BatchCallAndSponsor
	@echo "bcs-verify: all gates green"

bcs-mutation: verify-build ## Optional, non-gating: mutation report for BatchCallAndSponsor.sol (needs gambit on PATH)
	@command -v gambit >/dev/null || { echo "gambit not installed; see https://github.com/Certora/gambit"; exit 0; }
	gambit mutate --filename $(BCS_SRC) --solc_remappings "@openzeppelin/=node_modules/@openzeppelin/" && \
	echo "mutants written to gambit_out/; run 'forge test --match-path $(BCS_TESTS)' against each to measure kill rate"
