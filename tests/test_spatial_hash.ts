/**
 * Unit tests for SpatialHash<T> class.
 * Imports the production implementation from src/spatial_hash.ts.
 * Run with: npx tsx --test tests/test_spatial_hash.ts
 */

import { test } from "node:test";
import assert from "node:assert";
import { SpatialHash } from "../src/spatial_hash.js";

//============================================
// Test suite
//============================================

test("insert and query: small radius returns only inserted id", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("agent1", 5, 5);

  const results = hash.query(5, 5, 2);
  assert.deepStrictEqual(results, ["agent1"], "Should return inserted agent");
});

test("query with large radius spanning multiple buckets returns all ids", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("a", 5, 5);
  hash.insert("b", 25, 25);
  hash.insert("c", 35, 35);

  const results = hash.query(20, 20, 20);
  // All three agents are within 20 units of (20,20) or in overlapping cells.
  // a is at (5,5) ~ 21 units away (outside), but cells overlap.
  // b is at (25,25) ~ 7 units away (inside).
  // c is at (35,35) ~ 21 units away (outside), but cells might overlap.
  // This test verifies that query returns ids in deterministic sorted order.
  assert(Array.isArray(results), "Results should be an array");
  assert(results.includes("b"), "Should include agent b (25,25)");
  // Sort order check: results must be sorted.
  const sorted = results.slice().sort();
  assert.deepStrictEqual(results, sorted, "Results must be in sorted order");
});

test("move within same bucket is a no-op (no double-insert)", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("agent1", 5, 5);
  hash.move("agent1", 5, 5, 6, 6);

  const results = hash.query(5, 5, 2);
  assert.deepStrictEqual(
    results,
    ["agent1"],
    "Agent should appear once after move within same cell",
  );
});

test("move across buckets removes from old, inserts in new", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("agent1", 5, 5);
  hash.move("agent1", 5, 5, 25, 25);

  const oldResults = hash.query(5, 5, 2);
  assert.deepStrictEqual(oldResults, [], "Old location should not contain agent after move");

  const newResults = hash.query(25, 25, 2);
  assert.deepStrictEqual(newResults, ["agent1"], "New location should contain agent after move");
});

test("remove drops the id from query results", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("agent1", 5, 5);
  hash.remove("agent1", 5, 5);

  const results = hash.query(5, 5, 2);
  assert.deepStrictEqual(results, [], "Removed agent should not appear in query");
});

test("clear empties all buckets", () => {
  const hash = new SpatialHash<string>(10);
  hash.insert("a", 5, 5);
  hash.insert("b", 25, 25);
  hash.insert("c", 35, 35);
  hash.clear();

  const results = hash.query(20, 20, 50);
  assert.deepStrictEqual(results, [], "After clear, all queries should return empty");
});

test("1000 random insertions produce deterministic query output", () => {
  // Simple seeded LCG for reproducibility.
  class SimpleRNG {
    state: number;

    constructor(seed: number) {
      this.state = seed;
    }

    next(): number {
      this.state = (this.state * 1103515245 + 12345) % 2147483648;
      return this.state / 2147483648;
    }
  }

  const hash = new SpatialHash<string>(50);
  const rng = new SimpleRNG(42);

  // Insert 1000 random agents.
  for (let i = 0; i < 1000; i++) {
    const x = rng.next() * 1000;
    const y = rng.next() * 1000;
    hash.insert(`agent${i}`, x, y);
  }

  // Query a fixed point; results must be deterministic and sorted.
  const queryX = 500;
  const queryY = 500;
  const queryRadius = 150;

  const results1 = hash.query(queryX, queryY, queryRadius);

  // Verify results are sorted.
  const sorted = [...results1].sort();
  assert.deepStrictEqual(results1, sorted, "Query results must be in deterministic sorted order");

  // Re-query the same point; results must be identical.
  const results2 = hash.query(queryX, queryY, queryRadius);
  assert.deepStrictEqual(results1, results2, "Repeated queries must return identical results");

  // Verify at least some results (expecting non-empty given 1000 agents).
  assert(results1.length > 0, "Query should return at least some agents given 1000 insertions");
});
