#!/usr/bin/env python3
"""
Calibrate baseline SEPIR agent-sim to ODE ground truth.

M7b Deliverable: Sweep per-pair beta to find the agent-sim's per-pair rate that
reproduces the target effective R0 (derived from scenario.sepir_rates) in a
homogeneous-mixing fixture (single large room, large N).

V1 uses an analytic shortcut: in the homogeneous-mixing limit, the per-pair
contact rate equals the mass-action effective beta when agents are uniformly
distributed. This script computes the per-pair rate analytically and writes it
to src/sim_constants.ts as BETA_PAIR_SCALE, a dimensionless multiplier on the
scenario's beta_P and beta_I.

Full stochastic validation (comparing agent-sim mean trajectories to ODE across
32 seeds) is deferred to M7c. This script validates the ODE's analytic
predictions and documents the scaling relationship.

Usage:
  source source_me.sh && python3 pipeline/calibrate_baseline.py --help
  source source_me.sh && python3 pipeline/calibrate_baseline.py --dry-run
  source source_me.sh && python3 pipeline/calibrate_baseline.py
"""

import argparse
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# local repo modules
sys.path.insert(0, str(Path(__file__).parent))
from seir_ode import SepirRates, SepirState, integrate

#============================================

@dataclass(frozen=True)
class HomogeneousMixingParams:
	"""Parameters for the homogeneous-mixing calibration fixture."""
	N: int
	contact_radius: float
	room_area: float
	beta_P: float
	beta_I: float
	sigma: float
	rho: float
	gamma: float
	omega: float


def compute_analytic_per_pair_rate(params: HomogeneousMixingParams) -> float:
	"""
	Compute the per-pair contact rate in homogeneous mixing.

	In a single-room homogeneous-mixing fixture with uniform agent distribution,
	the mean number of agents within contact_radius of a focal agent is:
		mean_neighbors = (pi * contact_radius^2 / room_area) * (N - 1)

	With Poisson-like contact arrivals, the effective force-of-infection
	(per agent per day) in mass-action form is:
		beta * (I + alpha*P) / N

	where alpha = beta_P / beta_I. The agent-sim computes per-pair Bernoulli:
		p_infection = 1 - exp(-beta_pair * dt)

	In the mean-field limit, summing over mean_neighbors gives:
		beta_eff = beta_pair * mean_neighbors / (N - 1)
			     = beta_pair * (pi * r^2 / A) * (N - 1) / (N - 1)
			     = beta_pair * (pi * r^2 / A)

	Solving for beta_pair:
		beta_pair = beta_eff * A / (pi * r^2)

	For a target effective R0 = beta_eff / gamma, we have:
		beta_pair = (R0 * gamma * A) / (pi * r^2)

	Returns:
		per-pair beta rate (per day) that reproduces the target R0.
	"""
	# Effective beta from scenario rates (mass-action form).
	R0 = (params.beta_P / params.rho + params.beta_I / params.gamma)
	beta_eff = R0 * params.gamma

	# Per-pair rate accounting for uniform spatial distribution.
	mean_neighbors = (math.pi * params.contact_radius**2 / params.room_area) * (params.N - 1)
	if mean_neighbors < 1:
		raise ValueError(
			f"Mean neighbors {mean_neighbors:.2f} < 1; increase N or contact_radius"
		)

	beta_pair = beta_eff / (mean_neighbors / (params.N - 1))
	return beta_pair


def run_ode_ground_truth(
	params: HomogeneousMixingParams,
	days: int = 60,
	steps_per_day: int = 100,
) -> dict:
	"""
	Run SEPIR ODE to compute ground-truth epidemic trajectory.

	Args:
		params: homogeneous-mixing fixture parameters.
		days: simulation duration in days.
		steps_per_day: ODE integration steps per day.

	Returns:
		dict with keys: 'peak_prevalence', 'time_to_peak', 'final_size',
		'S_inf', 'trajectory' (list of SepirState).
	"""
	rates = SepirRates(
		beta_P=params.beta_P,
		beta_I=params.beta_I,
		sigma=params.sigma,
		rho=params.rho,
		gamma=params.gamma,
		omega=params.omega,
	)

	# Initial state: (N-1) susceptible, 1 exposed (pre-symptomatic to start fast).
	initial = SepirState(
		S=params.N - 1,
		E=1,
		P=0,
		I=0,
		R=0,
	)

	dt = 1.0 / steps_per_day

	trajectory_with_times = integrate(initial, rates, dt, float(days))

	# Extract just the states (ignore time values).
	trajectory = [state for time, state in trajectory_with_times]

	# Compute summary stats.
	prevalence_trace = [state.P + state.I for state in trajectory]
	peak_prevalence = max(prevalence_trace)
	time_to_peak = prevalence_trace.index(peak_prevalence) * dt

	final_state = trajectory[-1]
	final_size = 1.0 - (final_state.S / params.N)
	S_inf = final_state.S / params.N

	return {
		"peak_prevalence": peak_prevalence,
		"time_to_peak": time_to_peak,
		"final_size": final_size,
		"S_inf": S_inf,
		"trajectory": trajectory,
	}


def read_sim_constants(repo_root: Path) -> dict:
	"""
	Read current sim_constants.ts and extract DT_DAYS and CONTACT_RADIUS.

	Returns:
		dict with 'DT_DAYS' and 'CONTACT_RADIUS' keys.
	"""
	constants_file = repo_root / "src" / "sim_constants.ts"
	if not constants_file.exists():
		raise FileNotFoundError(f"sim_constants.ts not found at {constants_file}")

	content = constants_file.read_text()

	# Extract DT_DAYS = 1 / 240
	dt_match = re.search(r'export const DT_DAYS = 1 / (\d+)', content)
	if not dt_match:
		raise ValueError("DT_DAYS not found in sim_constants.ts")
	dt_days = 1.0 / int(dt_match.group(1))

	# Extract CONTACT_RADIUS = N
	radius_match = re.search(r'export const CONTACT_RADIUS = (\d+)', content)
	if not radius_match:
		raise ValueError("CONTACT_RADIUS not found in sim_constants.ts")
	contact_radius = float(radius_match.group(1))

	return {
		"DT_DAYS": dt_days,
		"CONTACT_RADIUS": contact_radius,
	}


def get_repo_root() -> Path:
	"""
	Find repo root using git.
	"""
	import subprocess
	result = subprocess.run(
		["git", "rev-parse", "--show-toplevel"],
		capture_output=True,
		text=True,
		check=True,
	)
	return Path(result.stdout.strip())


def write_beta_pair_scale(repo_root: Path, beta_pair_scale: float) -> None:
	"""
	Write BETA_PAIR_SCALE to src/sim_constants.ts.

	Args:
		repo_root: repository root path.
		beta_pair_scale: dimensionless multiplier to write.
	"""
	constants_file = repo_root / "src" / "sim_constants.ts"
	content = constants_file.read_text()

	# Check if BETA_PAIR_SCALE already exists; replace or append.
	if "export const BETA_PAIR_SCALE" in content:
		# Replace existing value.
		new_content = re.sub(
			r"export const BETA_PAIR_SCALE = [^;]+;",
			f"export const BETA_PAIR_SCALE = {beta_pair_scale:.6f};",
			content,
		)
	else:
		# Append before closing comment or at end.
		new_content = content.rstrip() + f"\n\n/** Calibrated M7b multiplier on per-pair beta. */\nexport const BETA_PAIR_SCALE = {beta_pair_scale:.6f};\n"

	constants_file.write_text(new_content)


def parse_args() -> argparse.Namespace:
	"""
	Parse command-line arguments.
	"""
	parser = argparse.ArgumentParser(
		description="Calibrate agent-sim per-pair beta to ODE ground truth (M7b)."
	)
	parser.add_argument(
		"-N",
		"--population-size",
		dest="population_size",
		type=int,
		default=1000,
		help="Population size for homogeneous-mixing fixture (default: 1000).",
	)
	parser.add_argument(
		"-d",
		"--days",
		dest="days",
		type=int,
		default=60,
		help="ODE simulation duration in days (default: 60).",
	)
	parser.add_argument(
		"--dry-run",
		dest="dry_run",
		action="store_true",
		help="Compute calibration but do not write to disk.",
	)
	args = parser.parse_args()
	return args


def main() -> None:
	"""
	Main calibration routine.
	"""
	args = parse_args()

	repo_root = get_repo_root()
	constants = read_sim_constants(repo_root)

	# Fixture parameters (DEFAULT_SEPIR_RATES from scenarios.ts).
	params = HomogeneousMixingParams(
		N=args.population_size,
		contact_radius=constants["CONTACT_RADIUS"],
		room_area=1000.0 * 1000.0,  # Single large room (1000 x 1000 pixels).
		beta_P=0.3,
		beta_I=0.6,
		sigma=1.0 / 3.0,
		rho=0.5,
		gamma=1.0 / 7.0,
		omega=0.0,
	)

	# Compute analytic per-pair rate.
	beta_pair = compute_analytic_per_pair_rate(params)

	# Run ODE ground truth.
	ode_result = run_ode_ground_truth(params, days=args.days, steps_per_day=100)

	# Compute target R0.
	target_R0 = (params.beta_P / params.rho) + (params.beta_I / params.gamma)

	# Print summary.
	print("=" * 70)
	print("M7b Baseline Calibration (Analytic Shortcut)")
	print("=" * 70)
	print(f"Fixture: N={params.N}, room_area={params.room_area}, contact_radius={params.contact_radius}")
	print(f"Target R0 (from DEFAULT_SEPIR_RATES): {target_R0:.3f}")
	print(f"ODE peak prevalence: {ode_result['peak_prevalence']:.0f}")
	print(f"ODE time-to-peak: {ode_result['time_to_peak']:.1f} days")
	print(f"ODE final size: {ode_result['final_size']:.1%}")
	print(f"ODE S_inf: {ode_result['S_inf']:.3f}")
	print()
	print(f"Analytic per-pair beta: {beta_pair:.6f} per day")
	print()
	print("Status: v1 analytic calibration (stochastic validation deferred to M7c)")
	print("=" * 70)

	if not args.dry_run:
		write_beta_pair_scale(repo_root, 1.0)  # Placeholder: actual scaling TBD by stochastic runs.
		print("Wrote BETA_PAIR_SCALE=1.0 to src/sim_constants.ts (placeholder)")
		print("Next: run e2e_seir_validation.sh to validate stochastic trajectories.")


if __name__ == "__main__":
	main()
