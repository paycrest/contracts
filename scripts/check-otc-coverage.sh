#!/usr/bin/env bash
# Parses `forge coverage --report summary` output and enforces a minimum line+branch % for one file.
# usage: check-otc-coverage.sh <summary.txt> <path/to/File.sol> <min-percent>
set -euo pipefail
summary=$1; file=$2; min=$3
row=$(grep -F "$file" "$summary" | head -1 || true)
[ -n "$row" ] || { echo "coverage: no row for $file in $summary"; exit 1; }
# Row shape: | contracts/OTCGateway.sol | 100.00% (120/120) | 100.00% (150/150) | 100.00% (40/40) | 100.00% (30/30) |
lines=$(echo "$row" | awk -F'|' '{print $3}' | grep -oE '[0-9]+\.[0-9]+' | head -1)
branches=$(echo "$row" | awk -F'|' '{print $5}' | grep -oE '[0-9]+\.[0-9]+' | head -1)
echo "coverage: $file lines=${lines}% branches=${branches}% (min ${min}%)"
awk -v l="$lines" -v b="$branches" -v m="$min" 'BEGIN{ if (l+0 < m+0 || b+0 < m+0) exit 1 }' \
  || { echo "coverage: below ${min}% on $file"; exit 1; }
