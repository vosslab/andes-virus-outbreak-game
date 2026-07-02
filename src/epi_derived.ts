import type { SepirRates } from "./types/simulation";

/**
 * Compute the basic reproductive number (R0) using effective transmission rates.
 *
 * This is a calibrated effective equivalent for the agent-based simulation:
 *   Effective R0 = (beta_P / rho) + (beta_I / gamma)
 *
 * Represents the average number of secondary infections caused by one infected
 * agent over their entire infectious period (both pre-symptomatic and symptomatic).
 *
 * Guards against division by zero by returning Infinity if rho or gamma is zero.
 */
export function effectiveR0(rates: SepirRates): number {
  if (rates.rho === 0 || rates.gamma === 0) {
    return Infinity;
  }

  const preSymptomatic = rates.beta_P / rates.rho;
  const symptomatic = rates.beta_I / rates.gamma;
  return preSymptomatic + symptomatic;
}

/**
 * Compute the effective reproduction number (Rt) at the current time.
 *
 * Accounts for the depletion of susceptible population:
 *   Effective Rt = Effective R0 * (S / N)
 *
 * where S is the number of susceptible individuals and N is the total population.
 * The susceptibleFraction parameter should be S / N, typically computed as
 * (healthy_count / total_population).
 *
 * Returns the product of R0 and susceptibleFraction.
 */
export function effectiveRt(rates: SepirRates, susceptibleFraction: number): number {
  const r0 = effectiveR0(rates);
  return r0 * susceptibleFraction;
}

/**
 * Compute the approximate herd immunity threshold.
 *
 * For a disease with effective R0, the herd immunity threshold is the fraction
 * of the population that must be immune to prevent sustained transmission:
 *   Threshold = 1 - (1 / Effective R0)
 *
 * If R0 <= 1, no herd immunity is needed, returns 0.
 * If rates are invalid (e.g., rho or gamma is zero), returns NaN.
 */
export function herdImmunityThreshold(rates: SepirRates): number {
  const r0 = effectiveR0(rates);

  if (!isFinite(r0)) {
    return NaN;
  }

  if (r0 <= 1) {
    return 0;
  }

  return 1 - 1 / r0;
}
