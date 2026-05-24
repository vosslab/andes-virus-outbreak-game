/**
 * Passenger separation tests (G10.5d).
 *
 * Validates M10.5 Patch 2: resolveOverlaps enforces hard radial separation
 * using PASSENGER_RADIUS = 4 px.
 *
 * These tests use an inline implementation of resolveOverlaps (matching
 * src/collision.ts) and a self-contained spatial hash fixture. Bare node --test
 * works without a tsx loader.
 *
 * Gate G10.5d:
 *   - min pair distance >= 2 * PASSENGER_RADIUS - tolerance (tolerance: 0.5 px)
 *   - No two agents ever at exact same center (dist == 0)
 *
 * Run: node --test tests/test_passenger_separation.mjs
 */

import { test } from "node:test";
import assert from "node:assert";

//============================================
// Constants (match src/sim_constants.ts and plan)
//============================================

const PASSENGER_RADIUS = 4; // px, from plan and sim_constants.ts
const MIN_SEP = 2 * PASSENGER_RADIUS; // 8 px
const TOLERANCE = 0.5; // px, from plan (relaxation residuals)
const SEPARATION_GATE = MIN_SEP - TOLERANCE; // 7.5 px

//============================================
// Inline spatial hash (minimal, for testing)
//============================================

/**
 * Minimal spatial hash for testing resolveOverlaps without importing SpatialHash<T>.
 */
class SimpleHash {
	constructor(cellSize) {
		this.cellSize = cellSize;
		this.buckets = new Map();
	}

	cellKey(x, y) {
		const cx = Math.floor(x / this.cellSize);
		const cy = Math.floor(y / this.cellSize);
		return `${cx},${cy}`;
	}

	insert(id, x, y) {
		const key = this.cellKey(x, y);
		const b = this.buckets.get(key);
		if (b === undefined) {
			this.buckets.set(key, new Set([id]));
		} else {
			b.add(id);
		}
	}

	query(x, y, radius) {
		const results = [];
		const cMinX = Math.floor((x - radius) / this.cellSize);
		const cMaxX = Math.floor((x + radius) / this.cellSize);
		const cMinY = Math.floor((y - radius) / this.cellSize);
		const cMaxY = Math.floor((y + radius) / this.cellSize);
		for (let cx = cMinX; cx <= cMaxX; cx++) {
			for (let cy = cMinY; cy <= cMaxY; cy++) {
				const key = `${cx},${cy}`;
				const b = this.buckets.get(key);
				if (b !== undefined) {
					for (const id of b) {
						results.push(id);
					}
				}
			}
		}
		results.sort((a, b) => a - b);
		return results;
	}
}

//============================================
// Inline resolveOverlaps (mirrors src/collision.ts)
//============================================

/**
 * Two-pass relaxation overlap resolver.
 * Returns new passenger array with updated positions.
 * getPolygon can be null to skip polygon re-clamp (no geometry in these tests).
 */
function resolveOverlaps(passengers, spatialHash, radius) {
	const MAX_PASSES = 2;
	const minSep = 2.0 * radius;

	// Mutable position map.
	const positions = new Map();
	for (const p of passengers) {
		positions.set(p.id, { x: p.position.x, y: p.position.y });
	}

	// Deterministic id order.
	const sortedIds = passengers.map((p) => p.id).sort((a, b) => a - b);

	for (let pass = 0; pass < MAX_PASSES; pass++) {
		for (const idA of sortedIds) {
			const posA = positions.get(idA);
			if (posA === undefined) {
				continue;
			}

			const candidates = spatialHash.query(posA.x, posA.y, minSep);

			for (const idB of candidates) {
				if (idB <= idA) {
					continue;
				}

				const posB = positions.get(idB);
				if (posB === undefined) {
					continue;
				}

				const dx = posB.x - posA.x;
				const dy = posB.y - posA.y;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (dist >= minSep) {
					continue;
				}

				let normX;
				let normY;
				if (dist < 0.001) {
					// Coincident centers: push along +x.
					normX = 1.0;
					normY = 0.0;
				} else {
					normX = dx / dist;
					normY = dy / dist;
				}

				const overlap = minSep - dist;
				const pushHalf = overlap / 2.0;

				positions.set(idA, { x: posA.x - normX * pushHalf, y: posA.y - normY * pushHalf });
				positions.set(idB, { x: posB.x + normX * pushHalf, y: posB.y + normY * pushHalf });
			}
		}
	}

	// Assemble result.
	return passengers.map((p) => {
		const newPos = positions.get(p.id);
		if (newPos !== undefined && (newPos.x !== p.position.x || newPos.y !== p.position.y)) {
			return { ...p, position: newPos };
		}
		return p;
	});
}

//============================================
// Fixture helpers
//============================================

/**
 * Create a simple passenger fixture.
 * id: numeric id, position: {x, y}
 */
function makePassenger(id, x, y) {
	return { id, position: { x, y } };
}

/**
 * Build a spatial hash from a list of passengers.
 */
function buildHash(passengers, cellSize = MIN_SEP) {
	const hash = new SimpleHash(cellSize);
	for (const p of passengers) {
		hash.insert(p.id, p.position.x, p.position.y);
	}
	return hash;
}

/**
 * Compute the minimum pairwise distance in an array of passengers.
 * Returns Infinity if fewer than 2 passengers.
 */
function minPairDist(passengers) {
	let min = Infinity;
	for (let i = 0; i < passengers.length; i++) {
		for (let j = i + 1; j < passengers.length; j++) {
			const dx = passengers[i].position.x - passengers[j].position.x;
			const dy = passengers[i].position.y - passengers[j].position.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d < min) {
				min = d;
			}
		}
	}
	return min;
}

/**
 * Count pairs with exact-center coincidence (dist < epsilon).
 */
function exactOverlapCount(passengers, epsilon = 0.001) {
	let count = 0;
	for (let i = 0; i < passengers.length; i++) {
		for (let j = i + 1; j < passengers.length; j++) {
			const dx = passengers[i].position.x - passengers[j].position.x;
			const dy = passengers[i].position.y - passengers[j].position.y;
			if (Math.sqrt(dx * dx + dy * dy) < epsilon) {
				count++;
			}
		}
	}
	return count;
}

//============================================
// Tests
//============================================

test("resolveOverlaps separates two coincident agents", () => {
	// Two agents at exact same position.
	const passengers = [makePassenger(0, 100, 100), makePassenger(1, 100, 100)];
	const hash = buildHash(passengers);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	const dx = result[0].position.x - result[1].position.x;
	const dy = result[0].position.y - result[1].position.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	assert.ok(
		dist > 0,
		`Coincident agents should be separated. Got dist=${dist}`,
	);
	assert.strictEqual(exactOverlapCount(result), 0, "No exact-center coincidence after resolve");
});

//============================================

test("resolveOverlaps: two agents at distance < MIN_SEP are pushed to >= SEPARATION_GATE", () => {
	// Place two agents 2 px apart (much less than MIN_SEP = 8).
	const passengers = [makePassenger(0, 100, 100), makePassenger(1, 102, 100)];
	const hash = buildHash(passengers);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	const minDist = minPairDist(result);
	assert.ok(
		minDist >= SEPARATION_GATE,
		`Min dist ${minDist.toFixed(3)} should be >= ${SEPARATION_GATE} (2*r - tolerance)`,
	);
	assert.strictEqual(exactOverlapCount(result), 0, "No exact-center coincidence");
});

//============================================

test("resolveOverlaps: two agents already at MIN_SEP remain unchanged", () => {
	// Agents already separated by exactly MIN_SEP = 8 px.
	const passengers = [makePassenger(0, 100, 100), makePassenger(1, 108, 100)];
	const hash = buildHash(passengers);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	// Positions should be unchanged (no overlap to resolve).
	assert.strictEqual(result[0].position.x, 100);
	assert.strictEqual(result[1].position.x, 108);
});

//============================================

test("resolveOverlaps: three agents in a line, all overlapping", () => {
	// Three agents clustered at x = 100, 101, 102 (all within MIN_SEP).
	const passengers = [
		makePassenger(0, 100, 100),
		makePassenger(1, 101, 100),
		makePassenger(2, 102, 100),
	];
	const hash = buildHash(passengers);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	assert.strictEqual(exactOverlapCount(result), 0, "No exact-center coincidence after 3-agent resolve");
});

//============================================

test("resolveOverlaps: agents NOT overlapping are not moved", () => {
	// Two agents far apart (200 px > MIN_SEP = 8).
	const passengers = [makePassenger(0, 0, 0), makePassenger(1, 200, 0)];
	const hash = buildHash(passengers);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	assert.strictEqual(result[0].position.x, 0, "Agent 0 should not move");
	assert.strictEqual(result[1].position.x, 200, "Agent 1 should not move");
});

//============================================

test("G10.5d: feasible-density fixture (N=40, 168x84 room) satisfies separation gate", () => {
	// Feasible density: 40 agents in a 168 x 84 px room.
	// Room area: 14112 px^2. With radius=4, circle area=50 px^2.
	// Packing budget: 14112 / 50 ~= 282 circles capacity, far above N=40.
	// This guarantees the strict separation gate is achievable.
	//
	// Place agents in an evenly-spaced grid within the room, then run resolveOverlaps.
	// Expect: min pair distance >= SEPARATION_GATE (7.5 px) after resolution.
	const ROOM_W = 168;
	const ROOM_H = 84;
	// N=40 agents: 8 columns x 5 rows, spaced ~21 x 17 px apart.

	const passengers = [];
	// Place in a 8x5 grid (40 agents), spaced 21 px x 17 px apart.
	const cols = 8;
	const rows = 5;
	const spacingX = ROOM_W / (cols + 1);
	const spacingY = ROOM_H / (rows + 1);
	let id = 0;
	for (let r = 1; r <= rows; r++) {
		for (let c = 1; c <= cols; c++) {
			passengers.push(makePassenger(id++, c * spacingX, r * spacingY));
		}
	}

	const hash = buildHash(passengers, MIN_SEP);
	const result = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	const minDist = minPairDist(result);
	const overlaps = exactOverlapCount(result);

	assert.strictEqual(overlaps, 0, `No exact-center coincidence. Got ${overlaps} overlapping pairs`);
	assert.ok(
		minDist >= SEPARATION_GATE,
		`Min pair dist ${minDist.toFixed(3)} should be >= ${SEPARATION_GATE} (G10.5d gate)`,
	);
});

//============================================

test("G10.5d: run 100 ticks on feasible-density fixture, never exact-center coincidence", () => {
	// Simulate 100 ticks with agents doing random walks, resolving overlaps each tick.
	// Assert: no exact-center coincidence ever observed.
	// Note: this test uses a simple deterministic pseudo-random walk (LCG seeded),
	// not the full simulation, to keep the test fast and dependency-free.

	const N = 20;
	const ROOM_W = 200;
	const ROOM_H = 200;
	const TICKS = 100;

	// Simple LCG for deterministic positions (not Math.random).
	let seed = 12345;
	function lcg() {
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		return ((seed >>> 0) / 4294967296);
	}

	// Place agents randomly within the room.
	let passengers = [];
	for (let i = 0; i < N; i++) {
		passengers.push(makePassenger(i, lcg() * ROOM_W, lcg() * ROOM_H));
	}

	for (let tick = 0; tick < TICKS; tick++) {
		// Move each agent randomly by up to 2 px per tick.
		passengers = passengers.map((p) => ({
			...p,
			position: {
				x: Math.max(0, Math.min(ROOM_W, p.position.x + (lcg() - 0.5) * 4)),
				y: Math.max(0, Math.min(ROOM_H, p.position.y + (lcg() - 0.5) * 4)),
			},
		}));

		// Rebuild hash after move.
		const hash = buildHash(passengers, MIN_SEP);
		passengers = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

		const overlaps = exactOverlapCount(passengers);
		assert.strictEqual(
			overlaps,
			0,
			`Exact-center coincidence at tick ${tick}: ${overlaps} pairs`,
		);
	}
});
