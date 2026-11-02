# Gateway + GatewaySettingManager verification gate (KAN-946), included from the Makefile.
#
#   make gw-verify       build, unit+fuzz, invariants, coverage, halmos, slither, storage layout, traceability,
#                        hardhat parity, against docs/gateway-spec.md
#   make gw-known-bugs   the tests for the spec's known violations (§6); they fail until the contract is fixed
#
# Same toolchain as otc-verify (FORGE, HALMOS, SLITHER, COVERAGE_MIN). CI: .github/workflows/gateway-verify.yml.

GW_SRC      := contracts/Gateway.sol
GW_SETTINGS := contracts/GatewaySettingManager.sol
GW_SPEC     := docs/gateway-spec.md
GW_TESTS    := test/foundry/Gateway*
GW_COVERAGE_SUMMARY := cache_forge/gw-coverage-summary.txt
# Everything but the two Gateway sources is excluded from their coverage figure.
GW_COVERAGE_EXCLUDE := (^test/|^lib/|contracts/mocks/|contracts/interfaces/|contracts/OTCGateway|contracts/BatchCallAndSponsor|contracts/ProviderBatchCallAndSponsor)

.PHONY: gw-test gw-invariants gw-coverage gw-halmos gw-slither gw-storage-layout gw-traceability gw-verify gw-known-bugs

gw-test: otc-build ## Gateway unit + fuzz tests
	$(FORGE) test --match-path '$(GW_TESTS)' --no-match-path '*invariants*' -vv

gw-invariants: otc-build ## Gateway handler-based invariant suite (token conservation, finality, pause, delisting)
	$(FORGE) test --match-path 'test/foundry/Gateway.invariants.t.sol' -vv

gw-coverage: otc-build ## 100% line+branch coverage gate on Gateway.sol and GatewaySettingManager.sol
	@mkdir -p $(dir $(GW_COVERAGE_SUMMARY))
	$(FORGE) coverage --match-path '$(GW_TESTS)' --no-match-coverage '$(GW_COVERAGE_EXCLUDE)' --report summary | tee $(GW_COVERAGE_SUMMARY)
	scripts/check-otc-coverage.sh $(GW_COVERAGE_SUMMARY) $(GW_SRC) $(COVERAGE_MIN)
	scripts/check-otc-coverage.sh $(GW_COVERAGE_SUMMARY) $(GW_SETTINGS) $(COVERAGE_MIN)

gw-halmos: ## Gateway bounded symbolic checks (check_ functions in GatewayHalmos)
	$(FORGE) build --ast --force >/dev/null
	$(HALMOS) --root . --match-contract '^GatewayHalmos$$' --match-test '^check_' --solver-timeout-assertion 60000 --loop 4

gw-slither: ## Static analysis of Gateway.sol + GatewaySettingManager.sol; fails on untriaged medium/high findings
	$(SLITHER) $(GW_SRC) --config-file slither.gateway.json --fail-medium

gw-storage-layout: otc-build ## Gateway layout is upgrade-compatible with every implementation in .openzeppelin/
	$(PY) scripts/check-gateway-storage-layout.py --forge $(FORGE)

gw-traceability: ## Every P-id in docs/gateway-spec.md has a named Gateway test
	scripts/check-spec-traceability.sh $(GW_SPEC) '$(GW_TESTS).t.sol'

gw-verify: otc-build gw-test gw-invariants gw-coverage gw-halmos gw-slither gw-storage-layout gw-traceability otc-hardhat-parity ## Full gate for Gateway + GatewaySettingManager
	@echo "gw-verify: all gates green"

gw-known-bugs: otc-build ## Non-gating: run the spec's known-violation tests (they fail until the fix lands)
	GW_KNOWN_BUGS=true $(FORGE) test --match-path 'test/foundry/Gateway.bugs.t.sol' -vv
