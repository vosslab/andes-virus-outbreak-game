#!/usr/bin/env node
/**
 * Overlap stress E2E test (G10.5e).
 *
 * N=1000 agents, 1000 ticks of random-walk movement with resolveOverlaps applied
 * each tick. Hard assertion: no exact-center coincidence ever (dist < 0.001 px).
 * The "no pair within 2*radius" gate is NOT required here -- dense rooms may
 * exceed capacity (plan risk RH4).
 *
 * Telemetry emitted to stdout:
 *   - mean ticks-to-first-doorway (simulated via zone transition)
 *   - mean room transitions / day (transitions per 240 ticks)
 *   - max residual overlap (closest pair after all ticks)
 *   - wall-clock ms per tick
 *
 * Self-contained: no TypeScript imports. Uses the same physics model as
 * tests/test_passenger_separation.mjs and tests/test_movement_viability.mjs.
 *
 * Run: node tests/e2e/e2e_overlap_stress.mjs
 * Exit 0 on pass, exit 1 on any exact-center coincidence.
 */

const PASSENGER_RADIUS = 4;
const MIN_SEP = 2 * PASSENGER_RADIUS;
const N = 1000;
const TICKS = 1000;
const ROOM_W = 800;
const ROOM_H = 600;
const SPEED = 2.0;

//============================================
// Simple LCG (deterministic, no Math.random)
//============================================

let seed = 42;
function lcg() {
	seed = (seed * 1664525 + 1013904223) & 0xffffffff;
	return (seed >>> 0) / 4294967296;
}

//============================================
// Minimal spatial hash
//============================================

class SimpleHash {
	constructor(cellSize) {
		this.cellSize = cellSize;
		this.buckets = new Map();
	}

	cellKey(x, y) {
		return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
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
				const b = this.buckets.get(`${cx},${cy}`);
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
// resolveOverlaps (matches src/collision.ts)
//============================================

function resolveOverlaps(passengers, spatialHash, radius) {
	const MAX_PASSES = 2;
	const minSep = 2.0 * radius;

	const positions = new Map();
	for (const p of passengers) {
		positions.set(p.id, { x: p.x, y: p.y });
	}

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
					normX = 1.0;
					normY = 0.0;
				} else {
					normX = dx / dist;
					normY = dy / dist;
				}

				const pushHalf = (minSep - dist) / 2.0;
				positions.set(idA, { x: posA.x - normX * pushHalf, y: posA.y - normY * pushHalf });
				positions.set(idB, { x: posB.x + normX * pushHalf, y: posB.y + normY * pushHalf });
			}
		}
	}

	return passengers.map((p) => {
		const np = positions.get(p.id);
		if (np !== undefined && (np.x !== p.x || np.y !== p.y)) {
			return { ...p, x: np.x, y: np.y };
		}
		return p;
	});
}

//============================================
// Telemetry helpers
//============================================

function minPairDist(passengers) {
	let min = Infinity;
	// For N=1000, O(N^2) is too slow. Sample 200 pairs instead.
	// Full exact-overlap check is done via a dedicated pass below.
	const sample = Math.min(passengers.length, 200);
	for (let i = 0; i < sample; i++) {
		for (let j = i + 1; j < sample; j++) {
			const dx = passengers[i].x - passengers[j].x;
			const dy = passengers[i].y - passengers[j].y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d < min) {
				min = d;
			}
		}
	}
	return min;
}

function exactOverlapCount(passengers) {
	// Use spatial hash for O(N) exact-overlap detection instead of O(N^2).
	const hash = new SimpleHash(MIN_SEP);
	for (const p of passengers) {
		hash.insert(p.id, p.x, p.y);
	}
	let count = 0;
	for (const p of passengers) {
		const candidates = hash.query(p.x, p.y, 0.001);
		for (const id of candidates) {
			if (id <= p.id) {
				continue;
			}
			const other = passengers[id];
			if (other === undefined) {
				continue;
			}
			const dx = p.x - other.x;
			const dy = p.y - other.y;
			if (Math.sqrt(dx * dx + dy * dy) < 0.001) {
				count++;
			}
		}
	}
	return count;
}

//============================================
// Main stress run
//============================================

console.log(`Starting overlap stress test: N=${N}, ticks=${TICKS}`);

// Initialise passengers.
let passengers = [];
for (let i = 0; i < N; i++) {
	passengers.push({
		id: i,
		x: lcg() * ROOM_W,
		y: lcg() * ROOM_H,
		zone: 0, // zone id (0 or 1 for simulated room transitions)
		vel: { x: (lcg() - 0.5) * SPEED * 2, y: (lcg() - 0.5) * SPEED * 2 },
		firstDoorTick: null,
		transitions: 0,
	});
}

let totalTickMs = 0;
let totalOverlapsEverDetected = 0;
let maxResidualOverlap = 0;

for (let tick = 0; tick < TICKS; tick++) {
	const t0 = Date.now();

	// Move agents: random walk with speed cap and wall bounce.
	passengers = passengers.map((p) => {
		// Update velocity with small random force.
		let vx = p.vel.x + (lcg() - 0.5) * 0.5;
		let vy = p.vel.y + (lcg() - 0.5) * 0.5;
		const vm = Math.sqrt(vx * vx + vy * vy);
		if (vm > SPEED) {
			vx = (vx / vm) * SPEED;
			vy = (vy / vm) * SPEED;
		}

		let nx = p.x + vx;
		let ny = p.y + vy;

		// Bounce off walls.
		if (nx < 0 || nx > ROOM_W) {
			vx = -vx;
			nx = Math.max(0, Math.min(ROOM_W, nx));
		}
		if (ny < 0 || ny > ROOM_H) {
			vy = -vy;
			ny = Math.max(0, Math.min(ROOM_H, ny));
		}

		// Simulated zone transition at x=400 boundary.
		const newZone = nx > ROOM_W / 2 ? 1 : 0;
		const transitioned = newZone !== p.zone;
		const newTransitions = p.transitions + (transitioned ? 1 : 0);
		const newFirstDoor = p.firstDoorTick !== null ? p.firstDoorTick : (transitioned ? tick : null);

		return {
			...p,
			x: nx,
			y: ny,
			vel: { x: vx, y: vy },
			zone: newZone,
			transitions: newTransitions,
			firstDoorTick: newFirstDoor,
		};
	});

	// Rebuild spatial hash after move.
	const hash = new SimpleHash(MIN_SEP);
	for (const p of passengers) {
		hash.insert(p.id, p.x, p.y);
	}

	// Resolve overlaps.
	passengers = resolveOverlaps(passengers, hash, PASSENGER_RADIUS);

	// Hard check: no exact-center coincidence.
	const overlaps = exactOverlapCount(passengers);
	if (overlaps > 0) {
		totalOverlapsEverDetected += overlaps;
	}

	// Track max residual overlap (closest sampled pair distance).
	const minDist = minPairDist(passengers);
	if (minDist < maxResidualOverlap || tick === 0) {
		maxResidualOverlap = minDist;
	}

	totalTickMs += Date.now() - t0;
}

//============================================
// Telemetry report
//============================================

const agentsWithDoorCross = passengers.filter((p) => p.firstDoorTick !== null);
const meanFirstDoorTick =
	agentsWithDoorCross.length > 0
		? agentsWithDoorCross.reduce((s, p) => s + p.firstDoorTick, 0) / agentsWithDoorCross.length
		: null;

const meanTransitionsPerDay =
	passengers.reduce((s, p) => s + p.transitions, 0) / N / (TICKS / 240);

const meanTickMs = totalTickMs / TICKS;

console.log("\n--- Telemetry ---");
console.log(`  N agents: ${N}`);
console.log(`  Ticks: ${TICKS}`);
console.log(`  Exact-center overlaps detected (hard gate): ${totalOverlapsEverDetected}`);
console.log(`  Max residual overlap (min sampled pair dist): ${maxResidualOverlap.toFixed(3)} px`);
console.log(`  Agents that crossed a room boundary: ${agentsWithDoorCross.length} / ${N}`);
console.log(
	`  Mean ticks-to-first-doorway: ${meanFirstDoorTick !== null ? meanFirstDoorTick.toFixed(1) : "N/A"}`,
);
console.log(`  Mean room transitions / day: ${meanTransitionsPerDay.toFixed(2)}`);
console.log(`  Mean wall-clock ms/tick: ${meanTickMs.toFixed(2)} ms`);

//============================================
// Exit code
//============================================

if (totalOverlapsEverDetected > 0) {
	console.error(
		`\nFAIL G10.5e: ${totalOverlapsEverDetected} exact-center coincidences detected.`,
	);
	process.exit(1);
} else {
	console.log("\nPASS G10.5e: no exact-center coincidences. Overlap stress test passed.");
	process.exit(0);
}
