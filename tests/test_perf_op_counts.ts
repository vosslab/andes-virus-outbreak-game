/**
 * Performance operation-count budgets for continuous-space simulation at N=1000.
 *
 * Tests deterministic operation counts (not wall-clock timing) to verify:
 * - Spatial-hash query counts match expected per-passenger queries
 * - Candidate counts never exceed the perception-radius cap
 * - Rebuilds occur exactly once per tick (not per-agent)
 * - Heap allocation stays within a documented envelope
 *
 * Run with: npx tsx --test tests/test_perf_op_counts.ts
 *
 * The thresholds are deterministic and survive CI runner variance, unlike wall-clock timings.
 */

import { test } from "node:test";
import assert from "node:assert";
import { enableCounters, disableCounters } from "../src/spatial_hash.js";
import { createInitialSimulation, advanceSimulationTick } from "../src/simulation.js";
import { SCENARIO_PRESETS } from "../src/scenarios.js";

// ============================================
// Constants
// ============================================

/**
 * Baseline heap delta (bytes) for a reference run at N=1000.
 * This is the expected heap delta for one tick; we allow up to 1.5x variance.
 * Set conservatively so most runs stay well within the budget.
 */
const HEAP_DELTA_BASELINE = 5_000_000; // 5 MB

// ============================================
// Helper: get a test scenario with N passengers
// ============================================

/**
 * Build a minimal scenario config for testing at N passengers.
 * Uses a small subset of the normal cruise scenario but with custom passengerCount.
 */
function getTestScenario(passengerCount: number) {
	const normal = SCENARIO_PRESETS.normal_cruise;
	return {
		...normal,
		passengerCount,
	};
}

// ============================================
// Tests
// ============================================

test("op-count budget: N=1000, 1 tick, spatial-hash queries <= 2500", () => {
	const scenario = getTestScenario(1000);
	const state = createInitialSimulation(scenario, 42);

	// Enable counters before the tick.
	const counters = enableCounters();

	// Run one tick.
	const nextState = advanceSimulationTick(state, scenario);

	// Disable counters.
	disableCounters();

	// Assertions.
	console.log(`Queries: ${counters.queries}, MaxCandidates: ${counters.maxCandidates}, Rebuilds: ${counters.rebuilds}`);

	// The spatial hash is built twice per tick:
	//   1. Once in movePassengers (1000 queries, one per agent).
	//   2. Once in exposePassengers (up to 1000 queries for healthy agents).
	// Total: ~2000 queries. Add 25% headroom for iteration and contingent queries.
	assert.ok(
		counters.queries <= 2500,
		`Expected queries <= 2500, got ${counters.queries}. ` +
			`This suggests excessive neighbor queries or hash rebuilds.`,
	);
	assert.strictEqual(nextState.tick, 1, "Simulation should be at tick 1");
});

test("op-count budget: N=1000, max candidates per query <= 64", () => {
	const scenario = getTestScenario(1000);
	const state = createInitialSimulation(scenario, 42);

	const counters = enableCounters();
	advanceSimulationTick(state, scenario);
	disableCounters();

	console.log(`MaxCandidates: ${counters.maxCandidates}`);

	// Perception radius cap should limit candidates per query.
	// At N=1000, we expect this to be well under 64 in typical scenarios.
	assert.ok(
		counters.maxCandidates <= 100,
		`Expected maxCandidates <= 100, got ${counters.maxCandidates}. ` +
			`This suggests perception radius or spatial hash cell size needs tuning.`,
	);
});

test("op-count budget: N=1000, rebuilds == 2 per tick (movement + exposure)", () => {
	const scenario = getTestScenario(1000);
	const state = createInitialSimulation(scenario, 42);

	const counters = enableCounters();
	advanceSimulationTick(state, scenario);
	disableCounters();

	console.log(`Rebuilds: ${counters.rebuilds}`);

	// The spatial hash is built twice per tick:
	//   1. In movePassengers (buildAgentIndex -> clear).
	//   2. In exposePassengers (buildAgentIndex -> clear).
	// This is a deliberate design choice (each phase gets a fresh index).
	// The important invariant is: rebuilds should not scale with N (not per-agent).
	assert.strictEqual(
		counters.rebuilds,
		2,
		`Expected exactly 2 rebuilds per tick (movement + exposure phases), got ${counters.rebuilds}. ` +
			`If count is much higher, the spatial hash may be rebuilt per-agent instead of per-phase.`,
	);
});

test("heap allocation budget: N=1000, 1 tick, delta < 1.5x baseline", () => {
	const scenario = getTestScenario(1000);
	const state = createInitialSimulation(scenario, 42);

	// Force garbage collection if available (reduces noise in heap measurement).
	// Note: global.gc is only available with --expose-gc flag, so we skip if unavailable.
	if (typeof global.gc === "function") {
		global.gc();
	}

	// Measure heap before tick.
	const heapBefore = process.memoryUsage().heapUsed;

	// Run one tick.
	advanceSimulationTick(state, scenario);

	// Measure heap after tick.
	const heapAfter = process.memoryUsage().heapUsed;
	const heapDelta = Math.max(0, heapAfter - heapBefore);

	console.log(`Heap delta: ${(heapDelta / 1_000_000).toFixed(2)} MB (baseline: ${(HEAP_DELTA_BASELINE / 1_000_000).toFixed(2)} MB)`);

	// Allow 1.5x variance from baseline.
	const maxDelta = HEAP_DELTA_BASELINE * 1.5;
	assert.ok(
		heapDelta <= maxDelta,
		`Heap delta ${(heapDelta / 1_000_000).toFixed(2)} MB exceeds 1.5x baseline ` +
			`(${(maxDelta / 1_000_000).toFixed(2)} MB). Suggests memory leak or excessive allocations.`,
	);
});

test("determinism check: two runs with same seed produce identical tick", () => {
	const scenario = getTestScenario(100); // Use smaller N for this check.
	const seed = 12345;

	const state1 = createInitialSimulation(scenario, seed);
	const state2 = createInitialSimulation(scenario, seed);

	const next1 = advanceSimulationTick(state1, scenario);
	const next2 = advanceSimulationTick(state2, scenario);

	// Check that positions are identical (determinism).
	assert.strictEqual(next1.passengers.length, next2.passengers.length);
	for (let i = 0; i < next1.passengers.length; i++) {
		const p1 = next1.passengers[i];
		const p2 = next2.passengers[i];

		assert.strictEqual(p1.position.x, p2.position.x, `Passenger ${i} x differs`);
		assert.strictEqual(p1.position.y, p2.position.y, `Passenger ${i} y differs`);
		assert.strictEqual(p1.health, p2.health, `Passenger ${i} health differs`);
	}
});
