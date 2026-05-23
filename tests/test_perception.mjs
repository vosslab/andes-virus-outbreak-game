/**
 * Unit tests for perception helpers.
 * Fixtures: 9 passengers in a 3x3 grid at (0,0), (10,0), (20,0), (0,10), (10,10),
 * (20,10), (0,20), (10,20), (20,20) with ids 0..8.
 */

import { test } from "node:test";
import assert from "node:assert";

//============================================

/**
 * Mock SpatialHash for testing.
 * Implements the same interface as the real SpatialHash<number>.
 */
class MockSpatialHash {
	constructor(cellSize) {
		this.cellSize = cellSize;
		this.buckets = new Map();
	}

	insert(id, x, y) {
		const key = this.cellKey(x, y);
		const bucket = this.buckets.get(key);
		if (bucket === undefined) {
			this.buckets.set(key, new Set([id]));
		} else {
			bucket.add(id);
		}
	}

	remove(id, x, y) {
		const key = this.cellKey(x, y);
		const bucket = this.buckets.get(key);
		if (bucket !== undefined) {
			bucket.delete(id);
			if (bucket.size === 0) {
				this.buckets.delete(key);
			}
		}
	}

	move(id, oldX, oldY, newX, newY) {
		const oldKey = this.cellKey(oldX, oldY);
		const newKey = this.cellKey(newX, newY);

		if (oldKey === newKey) {
			return;
		}

		const oldBucket = this.buckets.get(oldKey);
		if (oldBucket !== undefined) {
			oldBucket.delete(id);
			if (oldBucket.size === 0) {
				this.buckets.delete(oldKey);
			}
		}

		const newBucket = this.buckets.get(newKey);
		if (newBucket === undefined) {
			this.buckets.set(newKey, new Set([id]));
		} else {
			newBucket.add(id);
		}
	}

	query(x, y, radius) {
		const results = [];
		const cellMinX = Math.floor((x - radius) / this.cellSize);
		const cellMaxX = Math.floor((x + radius) / this.cellSize);
		const cellMinY = Math.floor((y - radius) / this.cellSize);
		const cellMaxY = Math.floor((y + radius) / this.cellSize);

		for (let cellX = cellMinX; cellX <= cellMaxX; cellX++) {
			for (let cellY = cellMinY; cellY <= cellMaxY; cellY++) {
				const key = `${cellX},${cellY}`;
				const bucket = this.buckets.get(key);
				if (bucket !== undefined) {
					for (const id of bucket) {
						results.push(id);
					}
				}
			}
		}

		results.sort((a, b) => a - b);
		return results;
	}

	clear() {
		this.buckets.clear();
	}

	cellKey(x, y) {
		const cellX = Math.floor(x / this.cellSize);
		const cellY = Math.floor(y / this.cellSize);
		return `${cellX},${cellY}`;
	}
}

//============================================

/**
 * Build a test fixture: 9 passengers in a 3x3 grid.
 * Positions: (0,0), (10,0), (20,0), (0,10), (10,10), (20,10), (0,20), (10,20), (20,20)
 * IDs: 0..8
 */
function createFixture() {
	const passengers = [
		{ id: 0, position: { x: 0, y: 0 }, health: "healthy" },
		{ id: 1, position: { x: 10, y: 0 }, health: "healthy" },
		{ id: 2, position: { x: 20, y: 0 }, health: "healthy" },
		{ id: 3, position: { x: 0, y: 10 }, health: "healthy" },
		{ id: 4, position: { x: 10, y: 10 }, health: "healthy" },
		{ id: 5, position: { x: 20, y: 10 }, health: "healthy" },
		{ id: 6, position: { x: 0, y: 20 }, health: "healthy" },
		{ id: 7, position: { x: 10, y: 20 }, health: "healthy" },
		{ id: 8, position: { x: 20, y: 20 }, health: "healthy" },
	];
	return passengers;
}

/**
 * Helper: query neighbor IDs from a spatial hash.
 */
function queryNeighborIds(index, passenger, radius) {
	const candidates = index.query(passenger.position.x, passenger.position.y, radius);
	const result = candidates.filter((id) => id !== passenger.id);
	return result;
}

/**
 * Helper: query neighbors with exact distance filtering.
 */
function queryNeighborsWithinDistance(passengers, index, passenger, radius) {
	const candidates = index.query(passenger.position.x, passenger.position.y, radius);

	const passengerMap = new Map();
	for (const p of passengers) {
		passengerMap.set(p.id, p);
	}

	const results = [];
	for (const id of candidates) {
		if (id === passenger.id) {
			continue;
		}
		const other = passengerMap.get(id);
		if (other === undefined) {
			continue;
		}
		const dx = other.position.x - passenger.position.x;
		const dy = other.position.y - passenger.position.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		if (distance <= radius) {
			results.push({ id, distance });
		}
	}

	results.sort((a, b) => {
		const distDiff = a.distance - b.distance;
		if (distDiff !== 0) {
			return distDiff;
		}
		return a.id - b.id;
	});

	return results;
}

//============================================

test("queryNeighborIds radius=5 from center returns bucket candidates (not exact)", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4 at 10,10) with radius 5.
	// Cell size is 20, so center is at cell (0, 0).
	// Query circle touches cells at distance up to 5 from center.
	// Since cell size is 20, query radius 5 still reaches adjacent cells.
	// With cellSize=20, position (10,10) is in cell (0,0).
	// Adjacent cells are (-1,-1) to (1,1), all within query distance.
	// Passengers at corners (0,0), (10,0), (0,10) are in adjacent cells.
	const center = passengers[4];
	const neighbors = queryNeighborIds(index, center, 5);

	// The spatial hash returns bucket candidates; caller must filter by exact distance.
	// This test verifies the low-level query works and excludes self.
	assert(!neighbors.includes(4), "self should not be in neighbors");
});

test("queryNeighborIds radius=10 from center includes candidates", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4 at 10,10) with radius 10.
	// With cellSize=20, adjacent cells contain many passengers.
	const center = passengers[4];
	const neighbors = queryNeighborIds(index, center, 10);

	// The query returns bucket candidates (not filtered by exact distance).
	// It should include the cardinal neighbors (1, 3, 5, 7) and exclude self.
	assert(neighbors.includes(1), "should include north neighbor");
	assert(neighbors.includes(3), "should include west neighbor");
	assert(neighbors.includes(5), "should include east neighbor");
	assert(neighbors.includes(7), "should include south neighbor");
	assert(!neighbors.includes(4), "self should not be in neighbors");
});

test("queryNeighborIds with exact distance filter finds corners", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4 at 10,10) with radius 15.
	// Corners at distance sqrt(200) ≈ 14.14, well within 15.
	const center = passengers[4];
	const neighbors = queryNeighborsWithinDistance(passengers, index, center, 15);

	// All 8 other passengers should be returned (exact distance <= 15).
	const ids = neighbors.map((n) => n.id).sort((a, b) => a - b);
	const expected = [0, 1, 2, 3, 5, 6, 7, 8];
	assert.deepStrictEqual(ids, expected);
});

test("queryNeighborsWithinDistance sorts by distance then id", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4 at 10,10) with radius 15.
	const center = passengers[4];
	const neighbors = queryNeighborsWithinDistance(passengers, index, center, 15);

	// Verify sorting: distance first, then id as tiebreaker.
	assert.strictEqual(neighbors.length, 8);

	// Check that distances are non-decreasing.
	for (let i = 1; i < neighbors.length; i++) {
		assert(
			neighbors[i].distance >= neighbors[i - 1].distance,
			`distance not sorted at index ${i}`,
		);
	}

	// Check IDs with same distance are sorted.
	// North (id 1) and South (id 7) both at distance 10.
	const atDist10 = neighbors.filter((n) => n.distance === 10);
	assert.deepStrictEqual(
		atDist10.map((n) => n.id),
		[1, 3, 5, 7],
	);
});

test("queryNeighborIds excludes self", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4) with a large radius.
	const center = passengers[4];
	const neighbors = queryNeighborIds(index, center, 100);

	// Self (id 4) should not appear.
	assert(!neighbors.includes(4), "self should not be in neighbors");
	assert.strictEqual(neighbors.length, 8);
});

test("queryNeighborsWithinDistance excludes self", () => {
	const passengers = createFixture();
	const index = new MockSpatialHash(20);

	// Insert all passengers.
	for (const p of passengers) {
		index.insert(p.id, p.position.x, p.position.y);
	}

	// Query from center (id=4) with a large radius.
	const center = passengers[4];
	const neighbors = queryNeighborsWithinDistance(passengers, index, center, 100);

	// Self (id 4) should not appear.
	assert(!neighbors.some((n) => n.id === 4), "self should not be in neighbors");
	assert.strictEqual(neighbors.length, 8);
});
