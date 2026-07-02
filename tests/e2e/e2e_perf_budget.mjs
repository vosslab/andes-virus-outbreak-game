#!/usr/bin/env node
/**
 * Wall-clock performance budget E2E test for continuous-space simulation at N=1000.
 *
 * Runs the simulation for 1000 ticks at N=1000 passengers and measures mean wall time per tick.
 *
 * On CI (env.CI=true): runs in trend-only mode. Emits wall-clock timing to /tmp/perf_budget.json
 * and exits 0 regardless of timing. Trend regressions are flagged across runs.
 *
 * On local laptop: hard gate. Asserts mean tick wall time < 16 ms (target machine class:
 * 2024 MacBook Pro M-class baseline). Exits 1 on failure.
 *
 * Target machine class: 2024 MacBook Pro with M-series chip (M3, M4, etc.). Wall-clock
 * timing is inherently noisy; this test should be rerun 3-5 times to get a distribution.
 *
 * Run with: node tests/e2e/e2e_perf_budget.mjs
 */

import { createInitialSimulation, advanceSimulationTick } from "../../src/simulation.js";
import { SCENARIO_PRESETS } from "../../src/scenarios.js";
import { writeFileSync } from "fs";

// ============================================
// Configuration
// ============================================

const NUM_TICKS = 1000;
const PASSENGER_COUNT = 1000;

// Performance thresholds
const MAX_TICK_TIME_MS = 16; // Hard gate: target < 16 ms per tick on M-class laptop
const TICKS_PER_SEC_TARGET = 30; // Hard gate: target >= 30 ticks/sec (1000/30 ~= 33ms for all 1000 ticks)

// ============================================
// Helper: build test scenario
// ============================================

function getTestScenario(passengerCount) {
  const normal = SCENARIO_PRESETS.normal_cruise;
  return {
    ...normal,
    passengerCount,
  };
}

// ============================================
// Main: run perf test
// ============================================

async function main() {
  const isCI = process.env.CI === "true";
  const scenario = getTestScenario(PASSENGER_COUNT);
  const state = createInitialSimulation(scenario, 42);

  console.log(`Running perf budget test...`);
  console.log(`  Passengers: ${PASSENGER_COUNT}`);
  console.log(`  Ticks: ${NUM_TICKS}`);
  console.log(`  Mode: ${isCI ? "CI (trend only)" : "LOCAL LAPTOP (hard gate)"}`);

  // Warm up with a few ticks to stabilize the runtime
  let currentState = state;
  for (let i = 0; i < 5; i++) {
    currentState = advanceSimulationTick(currentState, scenario);
  }

  // Measure wall time for NUM_TICKS
  const tickTimes = [];
  const startTime = performance.now();

  for (let i = 0; i < NUM_TICKS; i++) {
    const tickStart = performance.now();
    currentState = advanceSimulationTick(currentState, scenario);
    const tickEnd = performance.now();
    tickTimes.push(tickEnd - tickStart);
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;
  const meanTickTime = totalTime / NUM_TICKS;
  const medianTickTime = tickTimes.sort((a, b) => a - b)[Math.floor(NUM_TICKS / 2)];
  const minTickTime = Math.min(...tickTimes);
  const maxTickTime = Math.max(...tickTimes);

  // ============================================
  // Report results
  // ============================================

  console.log("");
  console.log("Performance Results:");
  console.log(`  Total time: ${totalTime.toFixed(2)} ms`);
  console.log(`  Mean tick time: ${meanTickTime.toFixed(3)} ms`);
  console.log(`  Median tick time: ${medianTickTime.toFixed(3)} ms`);
  console.log(`  Min tick time: ${minTickTime.toFixed(3)} ms`);
  console.log(`  Max tick time: ${maxTickTime.toFixed(3)} ms`);
  console.log(`  Ticks per second: ${(1000 / meanTickTime).toFixed(1)}`);

  // ============================================
  // CI vs local behavior
  // ============================================

  if (isCI) {
    // CI mode: trend only, always exit 0
    console.log("");
    console.log("CI mode: emitting artifact for trend tracking...");

    const artifact = {
      timestamp: new Date().toISOString(),
      machine_class: "CI runner",
      passenger_count: PASSENGER_COUNT,
      num_ticks: NUM_TICKS,
      mean_tick_time_ms: meanTickTime,
      median_tick_time_ms: medianTickTime,
      min_tick_time_ms: minTickTime,
      max_tick_time_ms: maxTickTime,
      ticks_per_second: 1000 / meanTickTime,
      total_time_ms: totalTime,
    };

    const artifactPath = "/tmp/perf_budget.json";
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log(`Artifact written to ${artifactPath}`);
    console.log("CI mode: exiting 0 (trend warning only, not a failure)");
    process.exit(0);
  } else {
    // Local laptop: hard gate
    console.log("");
    console.log(`Local laptop mode: hard gate check...`);
    console.log(
      `  Target: mean tick time < ${MAX_TICK_TIME_MS} ms (>= ${TICKS_PER_SEC_TARGET} ticks/sec)`,
    );

    if (meanTickTime > MAX_TICK_TIME_MS) {
      console.error(
        `FAILED: mean tick time ${meanTickTime.toFixed(3)} ms exceeds ` +
          `${MAX_TICK_TIME_MS} ms threshold.`,
      );
      console.error(
        `Expected >= ${TICKS_PER_SEC_TARGET} ticks/sec; got ${(1000 / meanTickTime).toFixed(1)}/sec`,
      );
      process.exit(1);
    }

    console.log(`PASSED: mean tick time ${meanTickTime.toFixed(3)} ms < ${MAX_TICK_TIME_MS} ms`);
    console.log(
      `Achieved ${(1000 / meanTickTime).toFixed(1)} ticks/sec (target >= ${TICKS_PER_SEC_TARGET})`,
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
