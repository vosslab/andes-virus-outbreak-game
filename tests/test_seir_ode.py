"""
Pytest unit tests for SEPIR ODE integrator.

Tests verify: conservation of population, monotonicity of S, behavior with
zero transition rates, final-size calculation, and peak prevalence.
"""

import sys
import file_utils

# Add pipeline to path
REPO_ROOT = file_utils.get_repo_root()
sys.path.insert(0, f"{REPO_ROOT}/pipeline")

from seir_ode import (
	SepirRates,
	SepirState,
	integrate,
	peak_prevalence,
	final_size,
)


#============================================

def test_conservation_of_population() -> None:
	"""
	Test that integrate conserves total population N.

	Runs 100 integration steps and checks that the sum S+E+P+I+R remains
	within 1e-6 of the initial total at every step.
	"""
	rates = SepirRates(
		beta_P=0.3,
		beta_I=0.6,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=1.0/7.0,
		omega=0.0,
	)
	initial = SepirState(S=999.0, E=0.0, P=1.0, I=0.0, R=0.0)
	N = initial.S + initial.E + initial.P + initial.I + initial.R

	trajectory = integrate(initial, rates, dt_days=0.1, total_days=10.0)

	for time, state in trajectory:
		total = state.S + state.E + state.P + state.I + state.R
		error = abs(total - N)
		assert error < 1e-6, f"Conservation error at t={time}: {error}"


def test_susceptible_monotonic_with_no_waning() -> None:
	"""
	Test that S decreases monotonically when omega=0.

	With omega=0 (no waning) and beta_P, beta_I > 0, susceptible count should
	never increase. Final S should be strictly less than initial S.
	"""
	rates = SepirRates(
		beta_P=0.3,
		beta_I=0.6,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=1.0/7.0,
		omega=0.0,
	)
	initial = SepirState(S=999.0, E=0.0, P=1.0, I=0.0, R=0.0)

	trajectory = integrate(initial, rates, dt_days=0.01, total_days=100.0)

	S_values = [state.S for _, state in trajectory]
	for i in range(1, len(S_values)):
		assert S_values[i] <= S_values[i-1] + 1e-8, \
			f"S increased at step {i}: {S_values[i-1]} -> {S_values[i]}"

	final_S = S_values[-1]
	assert final_S < initial.S - 0.1, "S should decrease significantly"


def test_zero_recovery_rate() -> None:
	"""
	Test that with gamma=0, recovered count stays at initial value.

	When gamma=0, infectious individuals never recover, so R should remain
	constant. Final R should equal initial R.
	"""
	rates = SepirRates(
		beta_P=0.3,
		beta_I=0.0,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=0.0,
		omega=0.0,
	)
	initial = SepirState(S=999.0, E=0.0, P=1.0, I=0.0, R=0.0)

	trajectory = integrate(initial, rates, dt_days=0.1, total_days=10.0)

	for _, state in trajectory:
		assert state.R == 0.0, "R should remain at initial value when gamma=0"


def test_final_size_analytic_check() -> None:
	"""
	Test final size against SEIR final-size relationship.

	For SEIR with beta_P=0, beta_I=2.0, gamma=1.0, omega=0, R0=2.0.
	The final size z satisfies: z = 1 - exp(-R0*z).
	This should yield z ~= 0.797 (numerically).
	Verify that ODE solution is within this ballpark (within 15%).
	"""
	# The implicit final-size equation is: z = 1 - exp(-R0*z)
	# For R0=2, the solution is approximately z ~= 0.797
	#R0 = 2.0
	z_target = 0.797  # Known solution for R0=2

	rates = SepirRates(
		beta_P=0.0,
		beta_I=2.0,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=1.0,
		omega=0.0,
	)
	initial = SepirState(S=999.0, E=0.0, P=1.0, I=0.0, R=0.0)

	trajectory = integrate(initial, rates, dt_days=0.01, total_days=200.0)
	ode_final_size = final_size(trajectory)

	relative_error = abs(ode_final_size - z_target) / z_target
	assert relative_error < 0.15, \
		f"Final size mismatch: ODE={ode_final_size:.4f}, expected={z_target:.4f}"


def test_peak_prevalence_grows_with_r0() -> None:
	"""
	Test that peak prevalence increases with higher R0.

	With R0 > 1, prevalence (P+I) should exceed the initial infectious count.
	Compare two runs with different beta_I: higher beta_I should give higher
	peak prevalence.
	"""
	rates_low = SepirRates(
		beta_P=0.2,
		beta_I=0.4,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=1.0/7.0,
		omega=0.0,
	)
	rates_high = SepirRates(
		beta_P=0.3,
		beta_I=0.6,
		sigma=1.0/3.0,
		rho=0.5,
		gamma=1.0/7.0,
		omega=0.0,
	)
	initial = SepirState(S=999.0, E=0.0, P=1.0, I=0.0, R=0.0)

	traj_low = integrate(initial, rates_low, dt_days=0.05, total_days=60.0)
	traj_high = integrate(initial, rates_high, dt_days=0.05, total_days=60.0)

	_, peak_low = peak_prevalence(traj_low)
	_, peak_high = peak_prevalence(traj_high)

	# Higher transmission should yield higher peak (with same initial state)
	assert peak_high > peak_low, \
		f"Higher R0 should give higher peak: {peak_low} vs {peak_high}"

	# Both should exceed initial infectious
	assert peak_low > initial.P, "Peak should exceed initial infectious for R0>1"


#============================================
