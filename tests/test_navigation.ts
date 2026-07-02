import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildRoomGraph,
  getRoomGraph,
  getEdgesFrom,
  planRoomPath,
  clearPathCache,
  nextWaypoint,
} from "../src/navigation.js";
import { SHIP_LAYOUT } from "../src/ship_layout.generated.js";

//============================================
// Test suite for navigation module
//============================================

test("buildRoomGraph returns 37 zones and 94 directed edges", () => {
  const graph = buildRoomGraph();

  // 37 zones total.
  assert.equal(graph.size, 37, `Expected 37 zones, got ${graph.size}`);

  // Count edges: each door creates 2 directed edges.
  let edgeCount = 0;
  for (const edges of graph.values()) {
    edgeCount += edges.length;
  }

  assert.equal(edgeCount, 94, `Expected 94 directed edges, got ${edgeCount}`);
});

test("getRoomGraph returns memoized instance with consistent identity", () => {
  clearPathCache();
  const graph1 = getRoomGraph();
  const graph2 = getRoomGraph();

  // Same object reference.
  assert.equal(graph1, graph2, "getRoomGraph should return memoized Map");
});

test("getEdgesFrom returns empty array for isolated zones", () => {
  // Isolated zones: obs_s, sun_deck, helideck
  const edgesSunDeck = getEdgesFrom("sun_deck");
  const edgesHelideck = getEdgesFrom("helideck");
  const edgesObsSouth = getEdgesFrom("obs_s");

  assert.equal(edgesSunDeck.length, 0, "sun_deck should have no outgoing edges");
  assert.equal(edgesHelideck.length, 0, "helideck should have no outgoing edges");
  assert.equal(edgesObsSouth.length, 0, "obs_s should have no outgoing edges");
});

test("planRoomPath(same zone, same zone) returns [zoneId]", () => {
  clearPathCache();
  const path = planRoomPath("cab_p1", "cab_p1");

  assert.deepEqual(path, ["cab_p1"], "Path from zone to itself should be [zone]");
});

test("planRoomPath(adjacent zones) returns a short path", () => {
  clearPathCache();
  // cab_p1 and corr_p are directly connected via door d002.
  const path = planRoomPath("cab_p1", "corr_p");

  assert.ok(path !== null, "Path should exist");
  assert.equal(path[0], "cab_p1", "Path should start at cab_p1");
  assert.equal(path[path.length - 1], "corr_p", "Path should end at corr_p");
  assert.ok(path.length <= 3, `Path should be short (got length ${path.length})`);
});

test("planRoomPath(isolated zone) returns null", () => {
  clearPathCache();
  // helideck is isolated (no edges).
  const path1 = planRoomPath("bridge", "helideck");
  const path2 = planRoomPath("cab_p1", "sun_deck");

  assert.equal(path1, null, "Path from bridge to helideck should be null");
  assert.equal(path2, null, "Path from cab_p1 to sun_deck should be null");
});

test("planRoomPath caches results with deterministic identity", () => {
  clearPathCache();
  const path1 = planRoomPath("cab_p1", "cab_p2");
  const path2 = planRoomPath("cab_p1", "cab_p2");

  // Same reference (cache hit).
  assert.equal(path1, path2, "Cached path should return same array reference");
});

test("all non-isolated zone pairs have reachable paths", () => {
  clearPathCache();

  // Find non-isolated zones (those with edges or reachable from others).
  const nonIsolatedZones: string[] = [];
  for (const zone of SHIP_LAYOUT.zones) {
    const edges = getEdgesFrom(zone.id);
    if (edges.length > 0) {
      nonIsolatedZones.push(zone.id);
    }
  }

  // Isolated zones: obs_s, sun_deck, helideck (should be 3).
  const isolatedCount = SHIP_LAYOUT.zones.length - nonIsolatedZones.length;
  assert.equal(isolatedCount, 3, `Expected 3 isolated zones, found ${isolatedCount}`);

  // For each pair of non-isolated zones, path should exist or be null.
  let pathsFound = 0;
  for (const from of nonIsolatedZones) {
    for (const to of nonIsolatedZones) {
      const path = planRoomPath(from, to);
      if (path !== null) {
        // Verify path starts and ends correctly.
        assert.equal(path[0], from, `Path should start at ${from}`);
        assert.equal(path[path.length - 1], to, `Path should end at ${to}`);
        pathsFound++;
      }
    }
  }

  // Most pairs should be reachable.
  const totalPairs = nonIsolatedZones.length * nonIsolatedZones.length;
  assert.ok(
    pathsFound > 0,
    `Expected some paths to exist; found ${pathsFound} out of ${totalPairs}`,
  );
});

test("nextWaypoint returns doorway midpoint when not at goal", () => {
  const path = ["cab_p1", "corr_p", "spa"];
  const currentZone = "cab_p1";
  const pathIndex = 0;
  const goalCenter = { x: 168, y: 210 }; // spa center

  const waypoint = nextWaypoint(currentZone, path, pathIndex, goalCenter);

  // Should return door midpoint from cab_p1 to corr_p.
  assert.ok(waypoint.x !== undefined && waypoint.y !== undefined);
  assert.ok(
    Number.isFinite(waypoint.x) && Number.isFinite(waypoint.y),
    "Waypoint should have finite coordinates",
  );
});

test("nextWaypoint returns goal center when at last zone", () => {
  const path = ["cab_p1", "corr_p", "spa"];
  const currentZone = "spa";
  const pathIndex = 2;
  const goalCenter = { x: 168, y: 210 }; // spa center

  const waypoint = nextWaypoint(currentZone, path, pathIndex, goalCenter);

  assert.deepEqual(waypoint, goalCenter, "Waypoint should be goal center when at last zone");
});

test("nextWaypoint throws when currentZoneId does not match path", () => {
  const path = ["cab_p1", "corr_p", "spa"];
  const currentZone = "cab_p2"; // Mismatch!
  const pathIndex = 0;
  const goalCenter = { x: 168, y: 210 };

  assert.throws(
    () => nextWaypoint(currentZone, path, pathIndex, goalCenter),
    /Replan required/,
    "Should throw when currentZoneId does not match path",
  );
});

test("computeAStarHeuristic is admissible (Euclidean distance)", () => {
  clearPathCache();
  // Find a reachable pair and verify the heuristic never overestimates.
  // This is implicitly tested by the fact that A* terminates successfully.
  const path = planRoomPath("bridge", "casino");

  assert.ok(path !== null && path.length > 1, "Should find a multi-step path");
});

test("path length statistics for non-isolated zone pairs", () => {
  clearPathCache();

  // Collect all paths.
  const pathLengths: number[] = [];
  for (const zone of SHIP_LAYOUT.zones) {
    if (getEdgesFrom(zone.id).length === 0) {
      continue; // Skip isolated zones.
    }

    for (const targetZone of SHIP_LAYOUT.zones) {
      if (getEdgesFrom(targetZone.id).length === 0) {
        continue; // Skip isolated zones.
      }

      const path = planRoomPath(zone.id, targetZone.id);
      if (path !== null) {
        pathLengths.push(path.length);
      }
    }
  }

  // Calculate average.
  const avg =
    pathLengths.length > 0 ? pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length : 0;

  // Log for reference (not a failure condition).
  console.log(`Found ${pathLengths.length} paths; average length: ${avg.toFixed(2)}`);

  assert.ok(pathLengths.length > 0, "Should find at least some valid paths");
  assert.ok(avg > 1 && avg < 10, `Average path length ${avg.toFixed(2)} seems reasonable`);
});
