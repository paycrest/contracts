#!/usr/bin/env bash
# Fails when a formal property listed in a spec has no test whose name carries its id.
# usage: check-spec-traceability.sh <spec.md> <test file glob, quoted>
# Convention: a test named `test_P3_x`, `testFuzz_P3_x`, `invariant_P3_x` or `check_P3_x` claims property P3.
# Only the given test files count, so another contract's suite with the same ids cannot satisfy them, and
# comments are stripped first, so a commented-out test does not count.
set -euo pipefail
cd "$(dirname "$0")/.."

SPEC=$1
GLOB=$2

ids=$(grep -oE '^\- \*\*P[0-9]+' "$SPEC" | grep -oE 'P[0-9]+' | sort -u -V)
[ -n "$ids" ] || { echo "traceability: no property ids in $SPEC"; exit 1; }
# shellcheck disable=SC2086 # the glob must expand
files=$(ls $GLOB)
# One left-to-right pass, so whichever of a string, a // comment or a /* comment starts first wins: a // comment
# that mentions /* cannot open a block, and comment markers inside strings stay.
# shellcheck disable=SC2086
code=$(perl -0777 -pe 's{("(?:\\.|[^"\\\n])*"|'"'"'(?:\\.|[^'"'"'\\\n])*'"'"')|//[^\n]*|/\*.*?\*/}{defined $1 ? $1 : ""}gse' $files)
missing=0
for id in $ids; do
  if grep -qE "function (test|testFuzz|invariant|check)_${id}_" <<<"$code"; then
    echo "  ${id}: ok"
  else
    echo "  ${id}: NO TEST"
    missing=1
  fi
done
[ "$missing" -eq 0 ] || { echo "traceability: properties without tests in $SPEC"; exit 1; }
echo "traceability: every property in $SPEC has a test"
