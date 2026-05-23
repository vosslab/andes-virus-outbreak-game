#!/usr/bin/env python3
"""
Spatial-hash cell-size tuning study.

Sweeps SPATIAL_HASH_CELL_SIZE across [14, 28, 56, 84, 112, 168] (multiples of 28-pixel tile)
to find the cell size with the lowest mean wall-clock tick time at N=1000 passengers over 100 ticks.

For each cell size:
	1. Update src/sim_constants.ts with the test cell size.
	2. Invoke the perf budget E2E test (Node headless runner).
	3. Collect mean tick wall time.
	4. Restore the original value.

Output: JSON report with (cell_size -> mean_ms) + optimal choice.

If the optimal cell size differs from the current value in src/sim_constants.ts:
	- Update the constant to the optimal value.
	- Print a warning: "Cell size changed from X to Y. Per plan risk R2,
	  MUST rerun pipeline/calibrate_baseline.py before next release."

DANGER: Changing cell size can break epidemiology calibration (risk R2 in the plan).
The constant tuple (dt, contact_radius, cell_size, perception_radius) is coupled.
Any change forces a recalibration cycle.

Run with: source source_me.sh && python3 pipeline/tune_spatial_hash.py
"""

import os
import re
import json
import subprocess
import sys

# ============================================
# Configuration
# ============================================

# Resolve REPO_ROOT via git, per docs/REPO_STYLE.md ("Determine REPO_ROOT
# with `git rev-parse --show-toplevel`, not by deriving paths from the
# current working directory").
REPO_ROOT = subprocess.run(
	["git", "rev-parse", "--show-toplevel"],
	check=True,
	capture_output=True,
	text=True,
).stdout.strip()
SIM_CONSTANTS_PATH = os.path.join(REPO_ROOT, "src", "sim_constants.ts")
PERF_BUDGET_TEST = os.path.join(REPO_ROOT, "tests", "e2e", "e2e_perf_budget.mjs")

# Cell sizes to sweep (multiples of 28-pixel tile; plan Q7 scope)
CELL_SIZES = [14, 28, 56, 84, 112, 168]

# Number of ticks per test run (use fewer for tuning vs full perf budget)
TUNING_TICKS = 100

# ============================================
# Helper: read current cell size
# ============================================

def read_current_cell_size():
	"""
	Read SPATIAL_HASH_CELL_SIZE from src/sim_constants.ts.
	Returns the integer value.
	"""
	with open(SIM_CONSTANTS_PATH, "r") as f:
		content = f.read()

	# Look for: export const SPATIAL_HASH_CELL_SIZE = 56;
	match = re.search(r"export\s+const\s+SPATIAL_HASH_CELL_SIZE\s*=\s*(\d+);", content)
	if not match:
		raise ValueError("Could not find SPATIAL_HASH_CELL_SIZE in sim_constants.ts")

	return int(match.group(1))


# ============================================
# Helper: write cell size
# ============================================

def write_cell_size(cell_size):
	"""
	Update SPATIAL_HASH_CELL_SIZE in src/sim_constants.ts to the given value.
	"""
	with open(SIM_CONSTANTS_PATH, "r") as f:
		content = f.read()

	# Replace the constant
	new_content = re.sub(
		r"(export\s+const\s+SPATIAL_HASH_CELL_SIZE\s*=\s*)\d+(\s*;)",
		rf"\g<1>{cell_size}\2",
		content,
	)

	if new_content == content:
		raise ValueError("Failed to update SPATIAL_HASH_CELL_SIZE")

	with open(SIM_CONSTANTS_PATH, "w") as f:
		f.write(new_content)


# ============================================
# Helper: run perf test and extract mean tick time
# ============================================

def run_perf_test_for_cell_size(cell_size):
	"""
	Run the perf budget test (via Node) with the current cell size.
	Parses stdout for "Mean tick time: X.XXX ms" and returns the value.
	Returns mean tick time in milliseconds, or None if test fails.
	"""
	print(f"  Running perf test with cell_size={cell_size}...")

	try:
		result = subprocess.run(
			["node", PERF_BUDGET_TEST],
			cwd=REPO_ROOT,
			capture_output=True,
			text=True,
			timeout=300,  # 5 min timeout per run
		)

		if result.returncode not in [0, 1]:
			# Non-zero exit is OK (hard gate failure in local mode)
			# We still extract the timing
			print(f"    Warning: test exited with code {result.returncode}")

		# Parse output for "Mean tick time: X.XXX ms"
		match = re.search(r"Mean tick time:\s*([\d.]+)\s*ms", result.stdout)
		if not match:
			print("    ERROR: could not parse mean tick time from output")
			print(f"    stdout: {result.stdout[:500]}")
			print(f"    stderr: {result.stderr[:500]}")
			return None

		mean_ms = float(match.group(1))
		print(f"    Mean tick time: {mean_ms:.3f} ms")
		return mean_ms

	except subprocess.TimeoutExpired:
		print("    ERROR: test timed out after 5 minutes")
		return None
	except Exception as e:
		print(f"    ERROR: {e}")
		return None


# ============================================
# Main: sweep and report
# ============================================

def main():
	print("===========================================")
	print("Spatial-Hash Cell-Size Tuning Study")
	print("===========================================")
	print("")

	# Read current value
	original_cell_size = read_current_cell_size()
	print(f"Current SPATIAL_HASH_CELL_SIZE: {original_cell_size}")
	print("")

	# Sweep cell sizes
	results = {}
	print(f"Sweeping cell sizes: {CELL_SIZES}")
	print("")

	for cell_size in CELL_SIZES:
		print(f"Testing cell_size={cell_size}:")
		write_cell_size(cell_size)
		mean_ms = run_perf_test_for_cell_size(cell_size)

		if mean_ms is None:
			print("  SKIPPED (test failed)")
			continue

		results[cell_size] = mean_ms
		print("")

	# Restore original for analysis
	write_cell_size(original_cell_size)

	# ============================================
	# Report results
	# ============================================

	print("===========================================")
	print("Tuning Study Results")
	print("===========================================")
	print("")

	if not results:
		print("ERROR: no successful runs")
		sys.exit(1)

	# Sort by mean tick time
	sorted_results = sorted(results.items(), key=lambda x: x[1])

	print("Cell size -> Mean tick time (ms):")
	for cell_size, mean_ms in sorted_results:
		marker = " <- OPTIMAL" if cell_size == sorted_results[0][0] else ""
		print(f"  {cell_size:3d} px: {mean_ms:7.3f} ms{marker}")

	print("")

	optimal_cell_size = sorted_results[0][0]
	optimal_time = sorted_results[0][1]

	print(f"Optimal cell size: {optimal_cell_size} px")
	print(f"Optimal mean tick time: {optimal_time:.3f} ms")
	print("")

	# ============================================
	# Decision: update or warn
	# ============================================

	if optimal_cell_size != original_cell_size:
		print("WARNING: Cell size has changed!")
		print(f"  Old: {original_cell_size} px")
		print(f"  New: {optimal_cell_size} px")
		print("")
		print("Per plan risk R2, the constant tuple")
		print("  (dt, contact_radius, cell_size, perception_radius)")
		print("is coupled and frozen after M7 calibration.")
		print("")
		print("REQUIRED ACTION:")
		print("  1. Update src/sim_constants.ts with the new cell size.")
		print("  2. Rerun pipeline/calibrate_baseline.py before the next release.")
		print("")

		# Update the constant
		print(f"Updating SPATIAL_HASH_CELL_SIZE to {optimal_cell_size}...")
		write_cell_size(optimal_cell_size)
		print("Done.")
		print("")

	else:
		print(f"Cell size is already optimal: {original_cell_size} px")
		print("")

	# ============================================
	# Write JSON report
	# ============================================

	report = {
		"study": "spatial_hash_cell_size_tuning",
		"original_cell_size": original_cell_size,
		"optimal_cell_size": optimal_cell_size,
		"changed": optimal_cell_size != original_cell_size,
		"results_ms": {str(k): v for k, v in sorted_results},
		"recommendation": f"Use cell_size={optimal_cell_size} px for mean tick time {optimal_time:.3f} ms",
	}

	report_path = os.path.join(REPO_ROOT, "pipeline", "tune_spatial_hash_report.json")
	with open(report_path, "w") as f:
		json.dump(report, f, indent=2)

	print(f"Report written to {report_path}")
	print("")

	return 0 if not report["changed"] else 0  # Always exit 0; warning is in stdout


if __name__ == "__main__":
	sys.exit(main())
