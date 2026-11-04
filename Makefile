# Formal verification gates for the Paycrest contracts.
#
#   make verify-tools   one-time: Foundry check, forge-std submodule, python venv with halmos + slither
#   make help           every gate and its steps
#
# Each contract's gate lives in its own `<name>-verify.mk`, included at the bottom of this file, and has its
# own CI workflow, which runs it with FOUNDRY_PROFILE=ci (heavier fuzz and invariant budgets).

SHELL := /bin/bash
# pipefail: a recipe like `forge coverage ... | tee FILE` fails when forge does, not when tee does.
.SHELLFLAGS := -o pipefail -c
.DEFAULT_GOAL := help

VENV        ?= .venv
PY          ?= python3
FORGE       ?= forge
HALMOS      := $(if $(wildcard $(VENV)/bin/halmos),$(VENV)/bin/halmos,halmos)
SLITHER     := $(if $(wildcard $(VENV)/bin/slither),$(VENV)/bin/slither,slither)
COVERAGE_MIN?= 100

.PHONY: help verify-tools verify-build hardhat-parity

help:
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-20s %s\n", $$1, $$2}'

verify-tools: ## Install/verify local toolchain (forge on PATH, forge-std submodule, venv with halmos+slither)
	@command -v $(FORGE) >/dev/null || { echo "forge not found: brew install foundry (or foundryup)"; exit 1; }
	@$(FORGE) --version
	@test -f lib/forge-std/src/Test.sol || { echo "installing forge-std"; git submodule update --init --recursive; test -f lib/forge-std/src/Test.sol || $(FORGE) install foundry-rs/forge-std; }
	@test -x $(VENV)/bin/pip || $(PY) -m venv $(VENV)
	@$(VENV)/bin/pip install --quiet --upgrade pip
	@# Local convenience installs the two pinned tools and lets their dependencies resolve for
	@# whatever interpreter you have. CI is the authority and installs requirements-verify.lock with
	@# --require-hashes; if a local result ever disagrees with CI, trust CI and compare the two.
	@$(VENV)/bin/pip install --quiet -r requirements-verify.txt
	@$(VENV)/bin/halmos --version && $(VENV)/bin/slither --version

verify-build: ## forge build (whole contracts/ tree, proves Hardhat + Foundry coexist)
	$(FORGE) build

hardhat-parity: ## Hardhat still compiles the same sources (ignition/typechain/abigen consumers)
	npx hardhat compile

# One file per gate (e.g. bcs-verify.mk, gateway-verify.mk).
include $(sort $(wildcard *-verify.mk))
