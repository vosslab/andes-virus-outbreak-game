#!/usr/bin/env python3
"""
SEPIR ODE integrator for deterministic epidemic simulation.

This module implements a fourth-order Runge-Kutta (RK4) integrator for the
SEPIR (Susceptible-Exposed-Presymptomatic-Infectious-Recovered) compartmental
model. The model describes disease dynamics using mass-action kinetics with
homogeneous mixing in a closed population.

SEPIR system (normalized):
  dS/dt = -beta_P * S * P / N - beta_I * S * I / N + omega * R
  dE/dt =  beta_P * S * P / N + beta_I * S * I / N - sigma * E
  dP/dt =  sigma * E - rho * P
  dI/dt =  rho * P - gamma * I
  dR/dt =  gamma * I - omega * R

Where:
  S = susceptible, E = exposed (infected but not yet infectious),
  P = presymptomatic (infectious but pre-symptom), I = infectious (symptomatic),
  R = recovered or removed. Total N = S + E + P + I + R is conserved.

Parameters:
  beta_P = transmission rate from presymptomatic infectious (per day)
  beta_I = transmission rate from symptomatic infectious (per day)
  sigma = rate of progression from exposed to presymptomatic (per day)
  rho = rate of progression from presymptomatic to symptomatic (per day)
  gamma = recovery rate from symptomatic infectious (per day)
  omega = waning immunity rate (recovered back to susceptible per day)

Reference: docs/SEIR_Simulation.md
"""

from dataclasses import dataclass
import argparse


@dataclass(frozen=True)
class SepirRates:
	"""
	Immutable container for SEPIR transmission and transition rates.

	Attributes:
		beta_P: transmission rate from presymptomatic (per day).
		beta_I: transmission rate from symptomatic (per day).
		sigma: progression rate from exposed to presymptomatic (per day).
		rho: progression rate from presymptomatic to symptomatic (per day).
		gamma: recovery rate from symptomatic (per day).
		omega: waning immunity rate (per day).
	"""
	beta_P: float
	beta_I: float
	sigma: float
	rho: float
	gamma: float
	omega: float


@dataclass(frozen=True)
class SepirState:
	"""
	Immutable container for SEPIR compartment sizes.

	Attributes:
		S: susceptible count.
		E: exposed count.
		P: presymptomatic infectious count.
		I: symptomatic infectious count.
		R: recovered or removed count.
	"""
	S: float
	E: float
	P: float
	I: float
	R: float


#============================================

def _sepir_derivatives(state: SepirState, rates: SepirRates, N: float) -> tuple:
	"""
	Compute SEPIR derivatives at a given state.

	Args:
		state: current compartment sizes.
		rates: transmission and transition rates.
		N: total population size.

	Returns:
		tuple of (dS, dE, dP, dI, dR) derivatives.
	"""
	force_of_infection = (rates.beta_P * state.P + rates.beta_I * state.I) / N
	dS = -force_of_infection * state.S + rates.omega * state.R
	dE = force_of_infection * state.S - rates.sigma * state.E
	dP = rates.sigma * state.E - rates.rho * state.P
	dI = rates.rho * state.P - rates.gamma * state.I
	dR = rates.gamma * state.I - rates.omega * state.R
	return (dS, dE, dP, dI, dR)


def _rk4_step(state: SepirState, rates: SepirRates, dt: float, N: float) -> SepirState:
	"""
	Perform one RK4 integration step.

	Args:
		state: current compartment sizes.
		rates: transmission and transition rates.
		dt: time step in days.
		N: total population size.

	Returns:
		new state after one step.
	"""
	# k1 at current state
	k1 = _sepir_derivatives(state, rates, N)

	# k2 at state + 0.5 * dt * k1
	state_half_k1 = SepirState(
		state.S + 0.5 * dt * k1[0],
		state.E + 0.5 * dt * k1[1],
		state.P + 0.5 * dt * k1[2],
		state.I + 0.5 * dt * k1[3],
		state.R + 0.5 * dt * k1[4],
	)
	k2 = _sepir_derivatives(state_half_k1, rates, N)

	# k3 at state + 0.5 * dt * k2
	state_half_k2 = SepirState(
		state.S + 0.5 * dt * k2[0],
		state.E + 0.5 * dt * k2[1],
		state.P + 0.5 * dt * k2[2],
		state.I + 0.5 * dt * k2[3],
		state.R + 0.5 * dt * k2[4],
	)
	k3 = _sepir_derivatives(state_half_k2, rates, N)

	# k4 at state + dt * k3
	state_full_k3 = SepirState(
		state.S + dt * k3[0],
		state.E + dt * k3[1],
		state.P + dt * k3[2],
		state.I + dt * k3[3],
		state.R + dt * k3[4],
	)
	k4 = _sepir_derivatives(state_full_k3, rates, N)

	# RK4 update
	new_S = state.S + (dt / 6.0) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0])
	new_E = state.E + (dt / 6.0) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1])
	new_P = state.P + (dt / 6.0) * (k1[2] + 2*k2[2] + 2*k3[2] + k4[2])
	new_I = state.I + (dt / 6.0) * (k1[3] + 2*k2[3] + 2*k3[3] + k4[3])
	new_R = state.R + (dt / 6.0) * (k1[4] + 2*k2[4] + 2*k3[4] + k4[4])

	return SepirState(new_S, new_E, new_P, new_I, new_R)


#============================================

def integrate(
	initial: SepirState,
	rates: SepirRates,
	dt_days: float,
	total_days: float,
) -> list[tuple[float, SepirState]]:
	"""
	Integrate SEPIR ODE using RK4 from initial state.

	Integrates the SEPIR system with the given rates from t=0 to t=total_days
	using fixed-step RK4 with step size dt_days. Returns trajectory as list of
	(time_days, state) tuples at each integration step.

	Args:
		initial: initial compartment sizes.
		rates: transmission and transition rates.
		dt_days: time step in days.
		total_days: total integration time in days.

	Returns:
		list of (time_days, state) tuples at each step.
	"""
	N = initial.S + initial.E + initial.P + initial.I + initial.R
	trajectory = [(0.0, initial)]
	state = initial
	time = 0.0

	num_steps = int(total_days / dt_days + 0.5)
	for _ in range(num_steps):
		state = _rk4_step(state, rates, dt_days, N)
		time += dt_days
		trajectory.append((time, state))

	return trajectory


#============================================

def peak_prevalence(trajectory: list[tuple[float, SepirState]]) -> tuple[float, float]:
	"""
	Find peak prevalence (P + I) in trajectory.

	Prevalence is the number of currently infectious individuals (presymptomatic
	and symptomatic combined). Returns the time at which this peak occurs and
	the peak value itself.

	Args:
		trajectory: list of (time_days, state) tuples.

	Returns:
		(peak_time_days, peak_prevalence) tuple.
	"""
	max_prev = 0.0
	peak_time = 0.0
	for time, state in trajectory:
		prevalence = state.P + state.I
		if prevalence > max_prev:
			max_prev = prevalence
			peak_time = time
	return (peak_time, max_prev)


def final_size(trajectory: list[tuple[float, SepirState]]) -> float:
	"""
	Compute final attack rate (fraction ever infected).

	Final size is 1 - S_final / N, representing the cumulative proportion of
	the population that has been infected by the end of the trajectory.

	Args:
		trajectory: list of (time_days, state) tuples.

	Returns:
		final attack rate (0 to 1).
	"""
	if not trajectory:
		return 0.0

	_, final_state = trajectory[-1]
	N = final_state.S + final_state.E + final_state.P + final_state.I + final_state.R
	return 1.0 - (final_state.S / N)


#============================================

def parse_args() -> argparse.Namespace:
	"""Parse command-line arguments."""
	parser = argparse.ArgumentParser(
		description="Integrate SEPIR ODE and report peak prevalence and final size."
	)
	parser.add_argument(
		'beta_P', type=float,
		help="transmission rate from presymptomatic (per day)"
	)
	parser.add_argument(
		'beta_I', type=float,
		help="transmission rate from symptomatic (per day)"
	)
	parser.add_argument(
		'sigma', type=float,
		help="progression rate from exposed to presymptomatic (per day)"
	)
	parser.add_argument(
		'rho', type=float,
		help="progression rate from presymptomatic to symptomatic (per day)"
	)
	parser.add_argument(
		'gamma', type=float,
		help="recovery rate from symptomatic (per day)"
	)
	parser.add_argument(
		'omega', type=float,
		help="waning immunity rate (per day)"
	)
	parser.add_argument(
		'total_days', type=float,
		help="total integration time (days)"
	)
	parser.add_argument(
		'dt_days', type=float,
		help="time step (days)"
	)
	parser.add_argument(
		'N', type=int,
		help="total population size"
	)
	parser.add_argument(
		'initial_infectious', type=int,
		help="initial number of infectious (in P compartment)"
	)
	args = parser.parse_args()
	return args


def main() -> None:
	"""Run ODE integration from command-line arguments and print results."""
	args = parse_args()

	rates = SepirRates(
		beta_P=args.beta_P,
		beta_I=args.beta_I,
		sigma=args.sigma,
		rho=args.rho,
		gamma=args.gamma,
		omega=args.omega,
	)

	initial = SepirState(
		S=args.N - args.initial_infectious,
		E=0.0,
		P=float(args.initial_infectious),
		I=0.0,
		R=0.0,
	)

	trajectory = integrate(initial, rates, args.dt_days, args.total_days)

	peak_time, peak_prev = peak_prevalence(trajectory)
	final_sz = final_size(trajectory)

	print(f"Peak prevalence time: {peak_time:.2f} days")
	print(f"Peak prevalence: {peak_prev:.2f}")
	print(f"Final size: {final_sz:.4f}")

	# Check conservation
	N = initial.S + initial.E + initial.P + initial.I + initial.R
	for time, state in trajectory:
		total = state.S + state.E + state.P + state.I + state.R
		error = abs(total - N)
		if error > 1e-6:
			print(f"Warning: conservation error at t={time:.2f}: {error:.2e}")


if __name__ == '__main__':
	main()
