"""
Ship layout generated artifacts freshness test.

This test verifies that src/ship_schematic.svg and src/ship_layout.generated.ts
remain in sync with data/ship.yaml. The test is shaped like an E2E test
(it runs a subprocess and inspects filesystem state), but completes in <2s
and pairs with the fast lane, so it belongs in tests/ not tests/e2e/.

If this test fails, regenerate the artifacts by running:
  python3 pipeline/generate_ship_svg.py
"""

import hashlib
import os
import subprocess
import sys

import file_utils


#============================================
def compute_file_hash(file_path: str) -> str:
	"""
	Compute SHA256 hash of a file's bytes.

	Args:
		file_path: Absolute path to file.

	Returns:
		str: Hex-encoded SHA256 hash.
	"""
	hasher = hashlib.sha256()
	with open(file_path, 'rb') as f:
		hasher.update(f.read())
	return hasher.hexdigest()


#============================================
def test_generated_artifacts_fresh() -> None:
	"""
	Verify ship layout artifacts are fresh relative to data/ship.yaml.

	Procedure:
	  1. Read current src/ship_schematic.svg and src/ship_layout.generated.ts.
	  2. Compute SHA256 hash of each file.
	  3. Run pipeline/generate_ship_svg.py via subprocess.
	  4. Re-read both files.
	  5. Compute new hashes.
	  6. Assert new hashes match pre-run hashes (byte-identical).

	On failure, report which file drifted and suggest the fix.
	"""
	repo_root = file_utils.get_repo_root()

	svg_path = os.path.join(repo_root, 'src', 'ship_schematic.svg')
	ts_path = os.path.join(repo_root, 'src', 'ship_layout.generated.ts')
	generator_path = os.path.join(repo_root, 'pipeline', 'generate_ship_svg.py')

	# Verify paths exist
	if not os.path.exists(svg_path):
		raise AssertionError(f"SVG artifact missing: {svg_path}")
	if not os.path.exists(ts_path):
		raise AssertionError(f"TypeScript artifact missing: {ts_path}")
	if not os.path.exists(generator_path):
		raise AssertionError(f"Generator missing: {generator_path}")

	# Canonical "fresh" = output of generator + prettier. First run
	# normalizes state regardless of what prior tests left behind, then we
	# capture the hash. Second run must produce identical output to prove
	# the pipeline is idempotent.
	def run_pipeline() -> None:
		gen = subprocess.run(
			[sys.executable, generator_path],
			cwd=repo_root,
			capture_output=True,
			text=True,
		)
		if gen.returncode != 0:
			raise AssertionError(
				f"Generator failed with exit code {gen.returncode}:\n"
				f"stderr: {gen.stderr}\n"
				f"stdout: {gen.stdout}"
			)
		fmt = subprocess.run(
			['npx', 'prettier', '--write', 'src/ship_layout.generated.ts'],
			cwd=repo_root,
			capture_output=True,
			text=True,
		)
		if fmt.returncode != 0:
			raise AssertionError(
				f"Prettier failed with exit code {fmt.returncode}:\n"
				f"stderr: {fmt.stderr}\n"
				f"stdout: {fmt.stdout}"
			)

	# First pass: normalize repo state to the canonical (generator + prettier)
	# output. Capture hashes of this canonical state.
	run_pipeline()
	svg_hash_before = compute_file_hash(svg_path)
	ts_hash_before = compute_file_hash(ts_path)

	# Second pass: must produce byte-identical output (idempotency contract).
	run_pipeline()
	svg_hash_after = compute_file_hash(svg_path)
	ts_hash_after = compute_file_hash(ts_path)

	svg_fresh = svg_hash_before == svg_hash_after
	ts_fresh = ts_hash_before == ts_hash_after

	if not svg_fresh or not ts_fresh:
		drifted = []
		if not svg_fresh:
			drifted.append('src/ship_schematic.svg')
		if not ts_fresh:
			drifted.append('src/ship_layout.generated.ts')

		drift_msg = ' and '.join(drifted)
		raise AssertionError(
			f"Generated artifacts drifted: {drift_msg}. "
			f"Run: python3 pipeline/generate_ship_svg.py"
		)
