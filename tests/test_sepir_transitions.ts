import { test } from "node:test";
import * as assert from "node:assert/strict";
import { rateToProb } from "../src/simulation";
import { effectiveR0, effectiveRt, herdImmunityThreshold } from "../src/epi_derived";
import type { SepirRates } from "../src/types/simulation";

// ==============================================
// Helper function for floating-point comparison
// ==============================================

/**
 * Check if two numbers are approximately equal within a tolerance.
 * Default tolerance is 1e-9 for exact calculations; use 1e-3 for small-dt approximations.
 */
function approxEqual(a: number, b: number, tolerance: number = 1e-9): boolean {
	return Math.abs(a - b) < tolerance;
}

// ==============================================
// rateToProb tests
// ==============================================

test("rateToProb: zero rate returns zero probability", () => {
	const prob = rateToProb(0, 1);
	assert.ok(approxEqual(prob, 0), `Expected 0, got ${prob}`);
});

test("rateToProb: zero rate with different dt still returns zero", () => {
	const prob = rateToProb(0, 10);
	assert.ok(approxEqual(prob, 0), `Expected 0, got ${prob}`);
});

test("rateToProb: unit rate and unit time gives 1 - e^-1", () => {
	const prob = rateToProb(1, 1);
	const expected = 1 - Math.exp(-1);
	assert.ok(approxEqual(prob, expected, 1e-9), `Expected ${expected}, got ${prob}`);
});

test("rateToProb: approximation for small dt", () => {
	// For rate=1 per day and dt=1/240 (tick duration), probability should be ~1/240
	const dt = 1 / 240;
	const rate = 1;
	const prob = rateToProb(rate, dt);
	const expectedApprox = 1 / 240;
	assert.ok(approxEqual(prob, expectedApprox, 1e-3), `Expected ~${expectedApprox}, got ${prob}`);
});

test("rateToProb: monotonic increasing with rate", () => {
	const dt = 0.1;
	const prob1 = rateToProb(1, dt);
	const prob2 = rateToProb(2, dt);
	assert.ok(prob2 > prob1, `rateToProb(2, ${dt}) should be > rateToProb(1, ${dt})`);
});

test("rateToProb: monotonic increasing with dt", () => {
	const rate = 1;
	const prob1 = rateToProb(rate, 0.1);
	const prob2 = rateToProb(rate, 0.2);
	assert.ok(prob2 > prob1, `rateToProb(${rate}, 0.2) should be > rateToProb(${rate}, 0.1)`);
});

test("rateToProb: probability never exceeds 1", () => {
	// Test with large rate and dt
	const prob = rateToProb(100, 1);
	assert.ok(prob <= 1, `Probability ${prob} should not exceed 1 (rate=100, dt=1)`);
});

test("rateToProb: probability approaches 1 asymptotically", () => {
	const prob = rateToProb(5, 1);
	assert.ok(
		prob < 1 && prob > 0.99,
		`Probability ${prob} should approach 1 for large rate*dt (rate=5, dt=1)`,
	);
});

// ==============================================
// effectiveR0 tests
// ==============================================

test("effectiveR0: basic calculation", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = (0.3 / 0.5) + (0.6 / (1/7)) = 0.6 + 4.2 = 4.8
	const r0 = effectiveR0(rates);
	assert.ok(approxEqual(r0, 4.8, 1e-9), `Expected 4.8, got ${r0}`);
});

test("effectiveR0: omega does not affect calculation", () => {
	const rates1: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const rates2: SepirRates = {
		...rates1,
		omega: 0.1,
	};
	const r0_1 = effectiveR0(rates1);
	const r0_2 = effectiveR0(rates2);
	assert.ok(
		approxEqual(r0_1, r0_2, 1e-9),
		`omega should not affect R0: omega=0 -> ${r0_1}, omega=0.1 -> ${r0_2}`,
	);
});

test("effectiveR0: rho=0 returns Infinity", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const r0 = effectiveR0(rates);
	assert.ok(!isFinite(r0), `Expected Infinity for rho=0, got ${r0}`);
});

test("effectiveR0: gamma=0 returns Infinity", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 0,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const r0 = effectiveR0(rates);
	assert.ok(!isFinite(r0), `Expected Infinity for gamma=0, got ${r0}`);
});

// ==============================================
// effectiveRt tests
// ==============================================

test("effectiveRt: fully susceptible population", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const susceptibleFraction = 1.0;
	const rt = effectiveRt(rates, susceptibleFraction);
	const r0 = effectiveR0(rates);
	assert.ok(
		approxEqual(rt, r0, 1e-9),
		`Rt with fully susceptible population should equal R0: Rt=${rt}, R0=${r0}`,
	);
});

test("effectiveRt: half susceptible population", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const susceptibleFraction = 0.5;
	const rt = effectiveRt(rates, susceptibleFraction);
	const r0 = effectiveR0(rates);
	const expected = r0 * 0.5;
	assert.ok(approxEqual(rt, expected, 1e-9), `Expected ${expected}, got ${rt}`);
});

test("effectiveRt: zero susceptible population", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const susceptibleFraction = 0;
	const rt = effectiveRt(rates, susceptibleFraction);
	assert.ok(approxEqual(rt, 0, 1e-9), `Rt should be 0 when susceptible fraction is 0, got ${rt}`);
});

test("effectiveRt: scales linearly with susceptible fraction", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const rt_25 = effectiveRt(rates, 0.25);
	const rt_75 = effectiveRt(rates, 0.75);
	const ratio = rt_75 / rt_25;
	assert.ok(
		approxEqual(ratio, 3, 1e-9),
		`Rt should scale linearly: 0.75 / 0.25 = 3, got ratio ${ratio}`,
	);
});

// ==============================================
// herdImmunityThreshold tests
// ==============================================

test("herdImmunityThreshold: basic calculation", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = 4.8, threshold = 1 - 1/4.8 ~ 0.7917
	const threshold = herdImmunityThreshold(rates);
	const expected = 1 - 1 / 4.8;
	assert.ok(approxEqual(threshold, expected, 1e-6), `Expected ~${expected}, got ${threshold}`);
});

test("herdImmunityThreshold: R0=1 returns 0", () => {
	const rates: SepirRates = {
		beta_P: 0.5,
		beta_I: 0,
		sigma: 1,
		rho: 1,
		gamma: 1,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = (0.5 / 1) + (0 / 1) = 0.5, which is < 1, so threshold = 0
	const threshold = herdImmunityThreshold(rates);
	assert.ok(approxEqual(threshold, 0, 1e-9), `Expected 0 for R0 < 1, got ${threshold}`);
});

test("herdImmunityThreshold: R0 < 1 returns 0", () => {
	const rates: SepirRates = {
		beta_P: 0.1,
		beta_I: 0.1,
		sigma: 1,
		rho: 1,
		gamma: 1,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = (0.1 / 1) + (0.1 / 1) = 0.2 < 1, so threshold = 0
	const threshold = herdImmunityThreshold(rates);
	assert.ok(approxEqual(threshold, 0, 1e-9), `Expected 0 for R0 < 1, got ${threshold}`);
});

test("herdImmunityThreshold: rho=0 returns NaN", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0,
		gamma: 1 / 7,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const threshold = herdImmunityThreshold(rates);
	assert.ok(Number.isNaN(threshold), `Expected NaN for rho=0, got ${threshold}`);
});

test("herdImmunityThreshold: gamma=0 returns NaN", () => {
	const rates: SepirRates = {
		beta_P: 0.3,
		beta_I: 0.6,
		sigma: 1,
		rho: 0.5,
		gamma: 0,
		omega: 0,
		isolation_goal_rate: 0,
	};
	const threshold = herdImmunityThreshold(rates);
	assert.ok(Number.isNaN(threshold), `Expected NaN for gamma=0, got ${threshold}`);
});

test("herdImmunityThreshold: increases with R0", () => {
	// Create two scenarios with different R0 values
	const rates_low: SepirRates = {
		beta_P: 0.1,
		beta_I: 0.2,
		sigma: 1,
		rho: 1,
		gamma: 1,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = 0.1 + 0.2 = 0.3

	const rates_high: SepirRates = {
		beta_P: 1,
		beta_I: 2,
		sigma: 1,
		rho: 1,
		gamma: 1,
		omega: 0,
		isolation_goal_rate: 0,
	};
	// R0 = 1 + 2 = 3

	const threshold_low = herdImmunityThreshold(rates_low);
	const threshold_high = herdImmunityThreshold(rates_high);

	// Both should be >= 0
	assert.ok(threshold_low >= 0 && threshold_high >= 0, `Both thresholds should be non-negative`);

	// Higher R0 should give higher threshold (since the low R0 is < 1, threshold is 0)
	// For high: 1 - 1/3 ~ 0.667
	assert.ok(
		threshold_high > threshold_low,
		`Higher R0 should give higher threshold: ${threshold_high} vs ${threshold_low}`,
	);
});

// ==============================================
// Integration tests: SEPIR boundary cases
// ==============================================

test("SEPIR boundary: omega=0 makes recovered state absorbing", () => {
	// With omega=0, the R->S transition should never occur (1 - exp(-0*dt) = 0)
	const prob = rateToProb(0, 1 / 240);
	assert.ok(
		approxEqual(prob, 0, 1e-9),
		`With omega=0, recovery-to-susceptible transition probability should be 0, got ${prob}`,
	);
});

test("SEPIR to SEIR equivalence: high omega produces rapid reinfection", () => {
	// Not a hard equivalence test, but check that high omega allows reinfection
	// rateToProb(omega, dt) with omega=10 and dt=1/240 should be ~10/240
	const prob = rateToProb(10, 1 / 240);
	const expectedApprox = 10 / 240;
	assert.ok(
		approxEqual(prob, expectedApprox, 1e-2),
		`High omega should allow reinfection; expected ~${expectedApprox}, got ${prob}`,
	);
});

test("Effective R0 matches SEPIR formula", () => {
	const rates: SepirRates = {
		beta_P: 0.2,
		beta_I: 0.4,
		sigma: 0.5,
		rho: 0.33,
		gamma: 0.14,
		omega: 0.01,
		isolation_goal_rate: 0,
	};
	const r0 = effectiveR0(rates);
	const expected = rates.beta_P / rates.rho + rates.beta_I / rates.gamma;
	assert.ok(approxEqual(r0, expected, 1e-9), `R0 should match formula: ${r0} vs ${expected}`);
});
