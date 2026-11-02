#!/usr/bin/env bash
# Fails when a formal property listed in docs/otc-gateway-spec.md has no test whose name carries its id.
# Convention: a test named `test_P3_feeExactness`, `testFuzz_P3_...`, `invariant_P1_...` or `check_P4_...`
# claims property P3 / P1 / P4. Skips with a warning while contracts/OTCGateway.sol does not exist yet (PR C1).
set -euo pipefail
cd "$(dirname "$0")/.."

SPEC=docs/otc-gateway-spec.md
SRC=contracts/OTCGateway.sol
TESTS=test/foundry

if [ ! -f "$SRC" ]; then
  echo "traceability: $SRC not present yet; skipping (becomes a hard gate once the contract lands)"
  exit 0
fi

ids=$(grep -oE '^\- \*\*P[0-9]+' "$SPEC" | grep -oE 'P[0-9]+' | sort -u -V)
missing=0
for id in $ids; do
  if grep -rqE "function (test|testFuzz|invariant|check)_${id}_" "$TESTS"; then
    echo "  ${id}: ok"
  else
    echo "  ${id}: NO TEST"
    missing=1
  fi
done
[ "$missing" -eq 0 ] || { echo "traceability: properties without tests"; exit 1; }
echo "traceability: every property has a test"
