# OTCGateway verification gate (KAN-797), included from the Makefile.
#
#   make otc-verify      build, unit+fuzz, invariants, 100% coverage, halmos, slither, traceability,
#                        hardhat parity, against docs/otc-gateway-spec.md
#
# Shared toolchain from the Makefile (FORGE, HALMOS, SLITHER, COVERAGE_MIN). CI: .github/workflows/otc-verify.yml.
#
# contracts/OTCGateway.sol lands in its own PR. Until it does, the gates that need the source
# (coverage, slither, traceability) say so and pass, so the harness itself stays verifiable.

OTC_SRC     := contracts/OTCGateway.sol
OTC_SPEC    := docs/otc-gateway-spec.md
# Unit/fuzz selection is "every Foundry test that is not BatchCallAndSponsor's": --no-match-contract takes a
# regex, so it needs no glob alternation. OTC_TRACE_FILES is a plain space-separated list for `ls`.
OTC_TESTS   := test/foundry/*
OTC_NOT_BCS := BatchCallAndSponsor
OTC_TRACE_FILES := test/foundry/Harness.t.sol test/foundry/OTCGateway*.sol
OTC_COVERAGE_SUMMARY := cache_forge/otc-coverage-summary.txt
# Everything but OTCGateway.sol is excluded from its coverage figure.
OTC_COVERAGE_EXCLUDE := (^test/|^lib/|contracts/mocks/|contracts/interfaces/|contracts/Gateway\.sol|contracts/GatewaySettingManager|contracts/BatchCallAndSponsor|contracts/ProviderBatchCallAndSponsor)

.PHONY: otc-test otc-invariants otc-coverage otc-halmos otc-slither otc-traceability otc-verify otc-mutation

otc-test: verify-build ## Harness + OTCGateway unit and fuzz tests
	$(FORGE) test --match-path '$(OTC_TESTS)' --no-match-path '*invariants*' --no-match-contract '$(OTC_NOT_BCS)' -vv

otc-invariants: verify-build ## OTCGateway handler-based invariant suite
	@if ls test/foundry/OTCGateway.invariants.t.sol >/dev/null 2>&1; then \
	  $(FORGE) test --match-path 'test/foundry/OTCGateway.invariants.t.sol' -vv; \
	else echo "otc-invariants: no invariant suite yet (lands with $(OTC_SRC))"; fi

otc-coverage: verify-build ## 100% line+branch coverage gate on contracts/OTCGateway.sol
	@if [ -f $(OTC_SRC) ]; then \
	  mkdir -p $(dir $(OTC_COVERAGE_SUMMARY)); \
	  $(FORGE) coverage --match-path '$(OTC_TESTS)' --no-match-coverage '$(OTC_COVERAGE_EXCLUDE)' --report summary --report lcov | tee $(OTC_COVERAGE_SUMMARY); \
	  scripts/check-coverage.sh $(OTC_COVERAGE_SUMMARY) $(OTC_SRC) $(COVERAGE_MIN); \
	else echo "otc-coverage: skipped, $(OTC_SRC) not present yet"; fi

otc-halmos: ## OTC bounded symbolic checks (check_ functions in HarnessTest and OTCGatewayHalmos)
	@# Foundry's cache does not key on --ast; a plain build leaves artifacts Halmos cannot parse, so force one.
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-contract '^(HarnessTest|OTCGatewayHalmos)$$' --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

otc-slither: ## Static analysis of OTCGateway.sol; fails on medium or high findings
	@if [ -f $(OTC_SRC) ]; then \
	  $(SLITHER) $(OTC_SRC) --config-file slither.config.json --fail-medium; \
	else \
	  echo "otc-slither: $(OTC_SRC) not present yet; analysing the repo so the toolchain is still exercised"; \
	  $(SLITHER) . --config-file slither.config.json --fail-medium; \
	fi

otc-traceability: ## Every P-id in docs/otc-gateway-spec.md has a named OTC test
	@if [ -f $(OTC_SRC) ]; then \
	  scripts/check-spec-traceability.sh $(OTC_SPEC) '$(OTC_TRACE_FILES)'; \
	else echo "otc-traceability: $(OTC_SRC) not present yet; becomes a hard gate once the contract lands"; fi

otc-verify: verify-build otc-test otc-invariants otc-coverage otc-halmos otc-slither otc-traceability hardhat-parity ## Full gate for OTCGateway
	@echo "otc-verify: all gates green"

otc-mutation: verify-build ## Optional, non-gating: mutation report for OTCGateway.sol (needs gambit on PATH)
	@command -v gambit >/dev/null || { echo "gambit not installed; see https://github.com/Certora/gambit"; exit 0; }
	gambit mutate --filename $(OTC_SRC) --solc_remappings "@openzeppelin/=node_modules/@openzeppelin/" && \
	echo "mutants written to gambit_out/; run 'forge test --match-path $(OTC_TESTS) --no-match-contract $(OTC_NOT_BCS)' against each to measure kill rate"
