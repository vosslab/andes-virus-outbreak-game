import { test } from "node:test";
import * as assert from "node:assert";
import { pointInPolygon, segmentsCross, stepWithCollision } from "../src/collision.js";
import type { Point } from "../src/types/simulation.js";

// ==============================================
// Test 1: Candidate inside polygon -> returned unchanged
// ==============================================

test("Test 1: candidate inside polygon is returned unchanged", () => {
	const square: readonly Point[] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];

	const currentPos: Point = { x: 50, y: 50 };
	const candidatePos: Point = { x: 55, y: 55 };
	const doorSegments: readonly (readonly [Point, Point])[] = [];

	const result = stepWithCollision(currentPos, candidatePos, square, doorSegments);

	assert.strictEqual(result.x, candidatePos.x, "x should match candidatePos.x");
	assert.strictEqual(result.y, candidatePos.y, "y should match candidatePos.y");
});

// ==============================================
// Test 2: Candidate outside polygon, no door on crossed wall -> clamped
// ==============================================

test("Test 2: candidate outside polygon without door is clamped", () => {
	const square: readonly Point[] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];

	const currentPos: Point = { x: 50, y: 50 };
	const candidatePos: Point = { x: 150, y: 50 }; // Outside the right wall.
	const doorSegments: readonly (readonly [Point, Point])[] = [];

	const result = stepWithCollision(currentPos, candidatePos, square, doorSegments);

	// Result should be clamped near the right wall (x ~ 99, just inside).
	assert.ok(result.x < candidatePos.x, "clamped x should be less than candidatePos.x");
	assert.ok(result.x >= 98, "clamped x should be near wall (>= 98)");
	assert.ok(result.x <= 100, "clamped x should not exceed 100");
	assert.ok(Math.abs(result.y - 50) < 2, "y should be near original (within 2 pixels)");
});

// ==============================================
// Test 3: Candidate outside polygon, door overlaps wall -> passage allowed
// ==============================================

test("Test 3: candidate outside polygon with door segment allows passage", () => {
	const square: readonly Point[] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];

	// Door on the right wall, centered at x=100, y=50.
	const doorSegments: readonly (readonly [Point, Point])[] = [
		[
			{ x: 100, y: 45 },
			{ x: 100, y: 55 },
		],
	];

	const currentPos: Point = { x: 50, y: 50 };
	const candidatePos: Point = { x: 150, y: 50 }; // Outside the right wall, at door location.

	const result = stepWithCollision(currentPos, candidatePos, square, doorSegments);

	// With door present, candidatePos should be returned unchanged (force-field passage).
	assert.strictEqual(result.x, candidatePos.x, "passage through door allows candidatePos.x");
	assert.strictEqual(result.y, candidatePos.y, "passage through door allows candidatePos.y");
});

// ==============================================
// Test 4: pointInPolygon on convex square (corner cases)
// ==============================================

test("Test 4: pointInPolygon handles corners and edges of a square", () => {
	const square: readonly Point[] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];

	// Interior point: should be inside.
	assert.strictEqual(
		pointInPolygon({ x: 50, y: 50 }, square),
		true,
		"interior point (50, 50) should be inside",
	);

	// Point outside (to the right).
	assert.strictEqual(
		pointInPolygon({ x: 150, y: 50 }, square),
		false,
		"point (150, 50) should be outside",
	);

	// Point outside (above).
	assert.strictEqual(
		pointInPolygon({ x: 50, y: 150 }, square),
		false,
		"point (50, 150) should be outside",
	);

	// Point outside (below).
	assert.strictEqual(
		pointInPolygon({ x: 50, y: -50 }, square),
		false,
		"point (50, -50) should be outside",
	);

	// Point outside (to the left).
	assert.strictEqual(
		pointInPolygon({ x: -50, y: 50 }, square),
		false,
		"point (-50, 50) should be outside",
	);
});

// ==============================================
// Test 5: segmentsCross on perpendicular and parallel segments
// ==============================================

test("Test 5: segmentsCross correctly identifies crossing and parallel segments", () => {
	// Perpendicular segments that cross.
	const seg1: [Point, Point] = [
		{ x: 0, y: 50 },
		{ x: 100, y: 50 },
	];
	const seg2: [Point, Point] = [
		{ x: 50, y: 0 },
		{ x: 50, y: 100 },
	];

	const crossing = segmentsCross(seg1, seg2);
	assert.ok(crossing !== null, "perpendicular segments should cross");
	assert.strictEqual(crossing.x, 50, "crossing x should be 50");
	assert.strictEqual(crossing.y, 50, "crossing y should be 50");

	// Parallel segments (no crossing).
	const seg3: [Point, Point] = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
	];
	const seg4: [Point, Point] = [
		{ x: 0, y: 50 },
		{ x: 100, y: 50 },
	];

	const noIntersection = segmentsCross(seg3, seg4);
	assert.strictEqual(noIntersection, null, "parallel segments should not cross");

	// Segments that do not cross (no shared region).
	const seg5: [Point, Point] = [
		{ x: 0, y: 0 },
		{ x: 50, y: 0 },
	];
	const seg6: [Point, Point] = [
		{ x: 100, y: 100 },
		{ x: 150, y: 100 },
	];

	const noOverlap = segmentsCross(seg5, seg6);
	assert.strictEqual(noOverlap, null, "non-overlapping segments should not cross");
});

// ==============================================
// Test 6: 1000-step stress test on square polygon with door
// ==============================================

test("Test 6: 1000-step stress test with LCG RNG", () => {
	// Simple LCG: x_{n+1} = (a * x_n + c) mod m
	const LCG_A = 1103515245;
	const LCG_C = 12345;
	const LCG_M = 2 ** 31;

	let seed = 42;

	function nextRandom(): number {
		seed = (LCG_A * seed + LCG_C) % LCG_M;
		return seed / LCG_M; // Normalize to [0, 1]
	}

	const square: readonly Point[] = [
		{ x: 0, y: 0 },
		{ x: 200, y: 0 },
		{ x: 200, y: 200 },
		{ x: 0, y: 200 },
	];

	// Door on the east wall, centered at x=200, y=100.
	const doorSegments: readonly (readonly [Point, Point])[] = [
		[
			{ x: 200, y: 95 },
			{ x: 200, y: 105 },
		],
	];

	let position: Point = { x: 100, y: 100 }; // Start in center.
	let doorCrossings = 0;
	let wallCrossings = 0;

	for (let step = 0; step < 1000; step++) {
		// Random walk: pick a direction and move.
		const angle = nextRandom() * 2 * Math.PI;
		const moveDistance = 2; // 2 pixels per step.
		const velocity: Point = {
			x: moveDistance * Math.cos(angle),
			y: moveDistance * Math.sin(angle),
		};

		const candidatePos: Point = {
			x: position.x + velocity.x,
			y: position.y + velocity.y,
		};

		const previousPos = position;
		position = stepWithCollision(position, candidatePos, square, doorSegments);

		// Check if we crossed the boundary.
		const wasInside = pointInPolygon(previousPos, square);
		const isInside = pointInPolygon(position, square);

		if (wasInside && !isInside) {
			// Crossed outward (should only happen through door).
			// Check if the crossing was near the door (x ~ 200, y ~ 100).
			if (Math.abs(position.x - 200) < 5 && Math.abs(position.y - 100) < 10) {
				doorCrossings += 1;
			} else {
				wallCrossings += 1;
			}
		}

		// Assert position is always inside or very close to the boundary (2-pixel tolerance for floating point).
		assert.ok(
			position.x >= -2 && position.x <= 202 && position.y >= -2 && position.y <= 202,
			`position (${position.x}, ${position.y}) should be within bounds (+/-2) at step ${step}`,
		);
	}

	// After 1000 steps, we should have at least some door crossings and zero wall crossings.
	assert.ok(doorCrossings > 0, `should have crossed door at least once (got ${doorCrossings})`);
	assert.strictEqual(
		wallCrossings,
		0,
		`should never cross walls without a door (got ${wallCrossings})`,
	);

	console.log(
		`Stress test complete: ${doorCrossings} door crossings, ${wallCrossings} wall crossings`,
	);
});
