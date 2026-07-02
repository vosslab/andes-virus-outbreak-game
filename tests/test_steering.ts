import { test } from "node:test";
import * as assert from "node:assert";
import {
  separation,
  alignment,
  cohesion,
  targetSeek,
  obstacleAvoid,
  doorwayBias,
} from "../src/steering";

// ==============================================
// Helper function for floating-point comparison
// ==============================================

function approxEqual(a: number, b: number, tolerance: number = 1e-9): boolean {
  return Math.abs(a - b) < tolerance;
}

function pointEqual(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  tolerance: number = 1e-9,
): boolean {
  return approxEqual(p1.x, p2.x, tolerance) && approxEqual(p1.y, p2.y, tolerance);
}

function magnitude(p: { x: number; y: number }): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}

// ==============================================
// separation() tests
// ==============================================

test("separation: single neighbor within distance", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [{ x: 5, y: 0 }];
  const desiredDistance = 10;

  const force = separation(self, neighbors, desiredDistance);

  // Distance is 5, scale_factor = (10 - 5) / 10 = 0.5
  // Direction away from (5, 0) is (-1, 0)
  // Force = (-1, 0) * 0.5 = (-0.5, 0)
  assert.ok(pointEqual(force, { x: -0.5, y: 0 }, 1e-9));
});

test("separation: neighbor at exactly desiredDistance boundary", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [{ x: 10, y: 0 }];
  const desiredDistance = 10;

  const force = separation(self, neighbors, desiredDistance);

  // Distance is exactly 10 (at boundary), scale_factor = 0
  // Force should be zero
  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("separation: neighbor beyond desiredDistance", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [{ x: 15, y: 0 }];
  const desiredDistance = 10;

  const force = separation(self, neighbors, desiredDistance);

  // Distance is 15 > desiredDistance, should not contribute
  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("separation: empty neighbors", () => {
  const self = { x: 0, y: 0 };
  const neighbors: { x: number; y: number }[] = [];
  const desiredDistance = 10;

  const force = separation(self, neighbors, desiredDistance);

  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("separation: multiple neighbors with different distances", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [
    { x: 5, y: 0 }, // distance 5, scale_factor = 0.5, direction (-1, 0)
    { x: 0, y: 2 }, // distance 2, scale_factor = 0.8, direction (0, -1)
  ];
  const desiredDistance = 10;

  const force = separation(self, neighbors, desiredDistance);

  // Expected: (-0.5, 0) + (0, -0.8) = (-0.5, -0.8)
  assert.ok(pointEqual(force, { x: -0.5, y: -0.8 }, 1e-9));
});

// ==============================================
// alignment() tests
// ==============================================

test("alignment: empty neighbors", () => {
  const selfVelocity = { x: 1, y: 0 };
  const neighborVelocities: { x: number; y: number }[] = [];

  const force = alignment(selfVelocity, neighborVelocities);

  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("alignment: single neighbor velocity", () => {
  const selfVelocity = { x: 1, y: 0 };
  const neighborVelocities = [{ x: 0, y: 2 }];

  const force = alignment(selfVelocity, neighborVelocities);

  // Mean of neighbors = (0, 2), force = (0, 2) - (1, 0) = (-1, 2)
  assert.ok(pointEqual(force, { x: -1, y: 2 }, 1e-9));
});

test("alignment: multiple neighbor velocities", () => {
  const selfVelocity = { x: 1, y: 0 };
  const neighborVelocities = [
    { x: 0, y: 2 },
    { x: 0, y: 2 },
  ];

  const force = alignment(selfVelocity, neighborVelocities);

  // Mean of neighbors = (0, 2), force = (0, 2) - (1, 0) = (-1, 2)
  assert.ok(pointEqual(force, { x: -1, y: 2 }, 1e-9));
});

// ==============================================
// cohesion() tests
// ==============================================

test("cohesion: empty neighbors", () => {
  const self = { x: 0, y: 0 };
  const neighbors: { x: number; y: number }[] = [];

  const force = cohesion(self, neighbors);

  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("cohesion: single neighbor", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [{ x: 10, y: 0 }];

  const force = cohesion(self, neighbors);

  // Mean = (10, 0), force = (10, 0) - (0, 0) = (10, 0)
  assert.ok(pointEqual(force, { x: 10, y: 0 }, 1e-9));
});

test("cohesion: multiple neighbors", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];

  const force = cohesion(self, neighbors);

  // Mean = (5, 5), force = (5, 5) - (0, 0) = (5, 5)
  assert.ok(pointEqual(force, { x: 5, y: 5 }, 1e-9));
});

// ==============================================
// targetSeek() tests
// ==============================================

test("targetSeek: basic case", () => {
  const self = { x: 0, y: 0 };
  const target = { x: 3, y: 4 };
  const maxSpeed = 10;

  const force = targetSeek(self, target, maxSpeed);

  // Distance = 5, unit direction = (3/5, 4/5), scaled by 10 = (6, 8)
  assert.ok(pointEqual(force, { x: 6, y: 8 }, 1e-9));
});

test("targetSeek: self equals target", () => {
  const self = { x: 5, y: 5 };
  const target = { x: 5, y: 5 };
  const maxSpeed = 10;

  const force = targetSeek(self, target, maxSpeed);

  // Distance = 0, should return (0, 0) to avoid NaN
  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("targetSeek: different maxSpeed", () => {
  const self = { x: 0, y: 0 };
  const target = { x: 1, y: 0 };
  const maxSpeed = 5;

  const force = targetSeek(self, target, maxSpeed);

  // Distance = 1, unit direction = (1, 0), scaled by 5 = (5, 0)
  assert.ok(pointEqual(force, { x: 5, y: 0 }, 1e-9));
});

// ==============================================
// obstacleAvoid() tests
// ==============================================

test("obstacleAvoid: single wall segment", () => {
  const self = { x: 5, y: 5 };
  const polygonWalls: [{ x: number; y: number }, { x: number; y: number }][] = [
    [
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
  ];
  const lookahead = 10;

  const force = obstacleAvoid(self, polygonWalls, lookahead);

  // Closest point on segment from (10, 0) to (10, 10) to (5, 5) is (10, 5)
  // Distance = 5, scale_factor = (10 - 5) / 10 = 0.5
  // Direction away = normalize((5, 5) - (10, 5)) = normalize((-5, 0)) = (-1, 0)
  // Force = (-1, 0) * 0.5 = (-0.5, 0)
  assert.ok(pointEqual(force, { x: -0.5, y: 0 }, 1e-9));
});

test("obstacleAvoid: empty walls", () => {
  const self = { x: 5, y: 5 };
  const polygonWalls: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const lookahead = 10;

  const force = obstacleAvoid(self, polygonWalls, lookahead);

  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("obstacleAvoid: wall beyond lookahead", () => {
  const self = { x: 0, y: 0 };
  const polygonWalls: [{ x: number; y: number }, { x: number; y: number }][] = [
    [
      { x: 100, y: 0 },
      { x: 100, y: 10 },
    ],
  ];
  const lookahead = 10;

  const force = obstacleAvoid(self, polygonWalls, lookahead);

  // Closest point is (100, 0), distance = 100 > lookahead, no contribution
  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("obstacleAvoid: multiple wall segments", () => {
  const self = { x: 5, y: 5 };
  const polygonWalls: [{ x: number; y: number }, { x: number; y: number }][] = [
    [
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ], // vertical wall at x=10
    [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ], // horizontal wall at y=10
  ];
  const lookahead = 10;

  const force = obstacleAvoid(self, polygonWalls, lookahead);

  // First segment: closest (10, 5), distance 5, scale 0.5, direction (-1, 0), contrib (-0.5, 0)
  // Second segment: closest (5, 10), distance 5, scale 0.5, direction (0, -1), contrib (0, -0.5)
  // Total = (-0.5, -0.5)
  assert.ok(pointEqual(force, { x: -0.5, y: -0.5 }, 1e-9));
});

// ==============================================
// doorwayBias() tests
// ==============================================

test("doorwayBias: null doorway", () => {
  const self = { x: 0, y: 0 };
  const doorSegment = null;
  const bias = 5;

  const force = doorwayBias(self, doorSegment, bias);

  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("doorwayBias: basic case", () => {
  const self = { x: 0, y: 0 };
  const doorSegment: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const bias = 5;

  const force = doorwayBias(self, doorSegment, bias);

  // Midpoint = (10, 5), distance = sqrt(100 + 25) = sqrt(125) ~ 11.18
  // Unit direction = (10, 5) / 11.18 ~ (0.894, 0.447)
  // Force = (0.894, 0.447) * 5 ~ (4.472, 2.236)
  const expectedMagnitude = bias;
  assert.ok(approxEqual(magnitude(force), expectedMagnitude, 1e-6));
});

test("doorwayBias: self at doorway midpoint", () => {
  const self = { x: 10, y: 5 };
  const doorSegment: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const bias = 5;

  const force = doorwayBias(self, doorSegment, bias);

  // Self is at midpoint, distance = 0, should return (0, 0)
  assert.ok(pointEqual(force, { x: 0, y: 0 }, 1e-9));
});

test("doorwayBias: different bias values", () => {
  const self = { x: 0, y: 0 };
  const doorSegment: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 4, y: 0 },
    { x: 4, y: 0 },
  ];
  const bias = 10;

  const force = doorwayBias(self, doorSegment, bias);

  // Midpoint = (4, 0), distance = 4, unit direction = (1, 0)
  // Force = (1, 0) * 10 = (10, 0)
  assert.ok(pointEqual(force, { x: 10, y: 0 }, 1e-9));
});

// ==============================================
// Integration tests
// ==============================================

test("integration: all steering rules combined", () => {
  const self = { x: 0, y: 0 };
  const neighbors = [{ x: 2, y: 0 }];
  const selfVel = { x: 0.5, y: 0 };
  const neighborVels = [{ x: 1, y: 0 }];
  const target = { x: 10, y: 0 };
  const walls: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const doorway: [{ x: number; y: number }, { x: number; y: number }] | null = null;

  const sep = separation(self, neighbors, 5);
  const align = alignment(selfVel, neighborVels);
  const cohere = cohesion(self, neighbors);
  const seek = targetSeek(self, target, 10);
  const avoid = obstacleAvoid(self, walls, 5);
  const door = doorwayBias(self, doorway, 5);

  // All should be valid Point objects
  assert.ok(typeof sep.x === "number" && typeof sep.y === "number");
  assert.ok(typeof align.x === "number" && typeof align.y === "number");
  assert.ok(typeof cohere.x === "number" && typeof cohere.y === "number");
  assert.ok(typeof seek.x === "number" && typeof seek.y === "number");
  assert.ok(typeof avoid.x === "number" && typeof avoid.y === "number");
  assert.ok(typeof door.x === "number" && typeof door.y === "number");
});
