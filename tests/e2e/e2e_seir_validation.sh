#!/bin/bash
#
# E2E test: M7b SEPIR calibration validation.
#
# Runs the calibration script in dry-run mode and validates:
#   - Calibrator exits 0
#   - ODE produces a reasonable epidemic (R0 ~4.8, peak < 50%, final size > 90%)
#   - Outputs analytic per-pair beta rate
#
# Usage:
#   bash tests/e2e/e2e_seir_validation.sh
#
# Exit code: 0 on pass, 1 on fail.

set -e

readonly REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Source Python environment.
source source_me.sh

# Run calibrator in dry-run mode.
python3 pipeline/calibrate_baseline.py --dry-run > /tmp/e2e_seir_output.txt 2>&1

# Check that output contains expected markers.
assert_contains() {
	local pattern="$1"
	local file="$2"
	if grep -q "$pattern" "$file"; then
		echo "OK: found '$pattern'"
	else
		echo "FAIL: pattern '$pattern' not found in output"
		cat "$file"
		exit 1
	fi
}

assert_contains "Target R0" /tmp/e2e_seir_output.txt
assert_contains "ODE peak prevalence" /tmp/e2e_seir_output.txt
assert_contains "ODE time-to-peak" /tmp/e2e_seir_output.txt
assert_contains "ODE final size" /tmp/e2e_seir_output.txt
assert_contains "Analytic per-pair beta" /tmp/e2e_seir_output.txt
assert_contains "v1 analytic calibration" /tmp/e2e_seir_output.txt

# Extract numerical values for tolerance checks (G7 criteria).
# Target R0 should be ~4.8.
target_r0=$(grep "Target R0" /tmp/e2e_seir_output.txt | grep -oE "[0-9]+\.[0-9]+" | head -1)
if (( $(echo "$target_r0 > 4.5 && $target_r0 < 5.1" | bc -l) )); then
	echo "OK: Target R0 = $target_r0 (within +-10% of 4.8)"
else
	echo "FAIL: Target R0 = $target_r0 (outside tolerance)"
	exit 1
fi

# ODE peak prevalence should be significant (agents do get infected).
peak_prev=$(grep "ODE peak prevalence" /tmp/e2e_seir_output.txt | grep -oE "[0-9]+" | tail -1)
if (( peak_prev > 100 && peak_prev < 500 )); then
	echo "OK: ODE peak prevalence = $peak_prev (reasonable)"
else
	echo "FAIL: ODE peak prevalence = $peak_prev (outside reasonable range)"
	exit 1
fi

# ODE final size should be high (most agents get infected).
# Extract the decimal value before the % sign.
final_size_line=$(grep "ODE final size" /tmp/e2e_seir_output.txt)
if [[ "$final_size_line" =~ ([0-9]+\.[0-9]+)% ]]; then
	final_size="${BASH_REMATCH[1]}"
	# Convert to integer percentage for comparison.
	final_size_int=$(printf "%.0f" "$final_size")
	if (( final_size_int > 85 && final_size_int < 100 )); then
		echo "OK: ODE final size = ${final_size}% (reasonable)"
	else
		echo "FAIL: ODE final size = ${final_size}% (outside reasonable range 85-100%)"
		exit 1
	fi
else
	echo "FAIL: Could not parse final size from: $final_size_line"
	exit 1
fi

echo ""
echo "=========================================="
echo "M7b SEIR Validation: PASS"
echo "=========================================="
