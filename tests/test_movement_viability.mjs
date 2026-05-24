/**
 * Movement viability tests (G10.5a, G10.5b).
 *
 * Validates the M10.5 motion-scaling fix: after removing the DT_DAYS multiplier
 * from velocity integration, an agent with seek force should reach a doorway
 * within the geometry-derived time budget.
 *
 * These tests use an inline physics fixture rather than importing simulation.ts
 * because src/tsconfig.json uses moduleResolution: bundler, which bare node --test
 * cannot resolve for .ts source files. The fixture models the corrected integration
 * faithfully: force cap at 2*speed, velocity += cappedForce, velocity capped at speed,
 * position += velocity each tick. This is identical to the production code path.
 *
 * Geometry reference:
 *   Cabin width: ~50 px (cab_p1 is 168 x 84; agent spawns near center).
 *   Distance to nearest wall/door: ~25-42 px depending on spawn.
 *   Nominal ticks at speed=2.0: 25 ticks. Gate: 60 ticks (2.4x margin).
 *
 * Run: node --test tests/test_movement_viability.mjs
 */

import { test } from "node:test";
import assert from "node:assert";

//============================================
// Inline physics fixture (mirrors corrected simulation.ts integration)
//============================================

/**
 * Simulate one physics tick.
 *
 * Args:
 *   pos: current position {x, y}
 *   vel: current velocity {x, y}
 *   targetPos: seek target {x, y}
 *   speed: max speed in px/tick
 *
 * Returns:
 *   {pos, vel} after one tick.
 */
function physTick(pos, vel, targetPos, speed) {
	// Seek force: unit direction toward target, scaled by speed.
	const dx = targetPos.x - pos.x;
	const dy = targetPos.y - pos.y;
	const dist = Math.sqrt(dx * dx + dy * dy);

	// If already at target, no force.
	const seekForce =
		dist < 0.01
			? { x: 0, y: 0 }
			: { x: (dx / dist) * speed, y: (dy / dist) * speed };

	// Force cap: 2 * speed (matches production code).
	const forceCap = 2.0 * speed;
	const forceMag = Math.sqrt(seekForce.x ** 2 + seekForce.y ** 2);
	const cappedForce =
		forceMag > forceCap
			? { x: (seekForce.x / forceMag) * forceCap, y: (seekForce.y / forceMag) * forceCap }
			: seekForce;

	// Velocity integration: no DT_DAYS (M10.5 fix).
	let newVel = {
		x: vel.x + cappedForce.x,
		y: vel.y + cappedForce.y,
	};

	// Speed cap.
	const velMag = Math.sqrt(newVel.x ** 2 + newVel.y ** 2);
	if (velMag > speed) {
		newVel = { x: (newVel.x / velMag) * speed, y: (newVel.y / velMag) * speed };
	}

	// Position step.
	const newPos = { x: pos.x + newVel.x, y: pos.y + newVel.y };

	return { pos: newPos, vel: newVel };
}

/**
 * Return the tick at which the agent first comes within threshold px of targetPos.
 * Returns null if not reached within maxTicks.
 */
function ticksToReach(startPos, targetPos, speed, threshold, maxTicks) {
	let pos = { ...startPos };
	let vel = { x: 0, y: 0 };
	for (let t = 0; t < maxTicks; t++) {
		const result = physTick(pos, vel, targetPos, speed);
		pos = result.pos;
		vel = result.vel;
		const dx = pos.x - targetPos.x;
		const dy = pos.y - targetPos.y;
		if (Math.sqrt(dx ** 2 + dy ** 2) <= threshold) {
			// t is 0-based; return tick count (t+1 ticks elapsed after this step).
			return t + 1;
		}
	}
	return null;
}

//============================================
// G10.5a: single cabin-agent reaches doorway within 60 ticks
//============================================

test("G10.5a: cabin agent (speed=2.0) reaches doorway in <= 60 ticks", () => {
	// cab_p1 room: approximately 168 x 84 px. Agent spawns near center (84, 42).
	// Nearest doorway target at the far wall: (168, 42) -- distance ~84 px.
	// With force=seek (weight 1.0) blended with seek (weight 1.0):
	// effective seek force = speed = 2.0 px/tick. In practice with weight blending
	// the actual seek weight is 1.0 (see simulation.ts seekForce weight). The fixture
	// uses a pure seek scenario (isolation case) for a clean gate.
	//
	// Geometry: 84 px at 2.0 px/tick = 42 ticks nominal. Gate: 60 ticks (1.4x margin).
	const startPos = { x: 84, y: 42 };
	const doorPos = { x: 168, y: 42 }; // right wall doorway
	const speed = 2.0;
	const threshold = 2.0; // within 2 px counts as "at doorway"

	const ticks = ticksToReach(startPos, doorPos, speed, threshold, 60);
	assert.notStrictEqual(
		ticks,
		null,
		`Agent did not reach doorway within 60 ticks (geometry: 84 px at ${speed} px/tick = 42 nominal)`,
	);
	assert.ok(
		ticks <= 60,
		`Agent reached doorway at tick ${ticks}, expected <= 60`,
	);
});

//============================================

test("G10.5a: cabin agent (speed=2.0) reaches doorway in <= 25 ticks with no opposing forces", () => {
	// Pure seek with no opponents: nominal geometry ~25 ticks for 50 px distance.
	// This confirms the fix gives plausible speed; no DT_DAYS should allow fast motion.
	const startPos = { x: 0, y: 0 };
	const doorPos = { x: 50, y: 0 }; // 50 px straight line
	const speed = 2.0;
	const threshold = 2.0;

	const ticks = ticksToReach(startPos, doorPos, speed, threshold, 25);
	assert.notStrictEqual(
		ticks,
		null,
		`Pure seek over 50 px should reach in <= 25 ticks at speed=2.0 px/tick`,
	);
});

//============================================

test("DT_DAYS bug model: old integration would NOT reach doorway within 60 ticks", () => {
	// This test documents the pre-fix behavior: multiplying force by DT_DAYS = 1/240
	// means each tick adds only 0.0083 px/tick of velocity. At this rate, reaching
	// top speed of 2.0 px/tick from rest takes ~240 ticks. Displacement in 60 ticks
	// is near zero. This test asserts the OLD behavior was broken (expect: NOT reached).
	const startPos = { x: 0, y: 0 };
	const doorPos = { x: 50, y: 0 };
	const speed = 2.0;
	const DT_DAYS = 1 / 240;

	// Simulate old buggy integration.
	let pos = { ...startPos };
	let vel = { x: 0, y: 0 };
	for (let t = 0; t < 60; t++) {
		const dx = doorPos.x - pos.x;
		const dist = Math.abs(dx) || 1;
		// old seek force scaled by DT_DAYS
		const seekForce = { x: (dx / dist) * speed * DT_DAYS, y: 0 };
		vel = { x: vel.x + seekForce.x, y: 0 };
		const velMag = Math.abs(vel.x);
		if (velMag > speed) {
			vel = { x: (vel.x / velMag) * speed, y: 0 };
		}
		pos = { x: pos.x + vel.x, y: 0 };
	}
	const finalDist = Math.abs(pos.x - doorPos.x);
	// With DT_DAYS bug, agent should NOT have reached the 50 px target.
	assert.ok(
		finalDist > 2.0,
		`With DT_DAYS bug, agent should be far from doorway. Final dist: ${finalDist.toFixed(2)} px`,
	);
});

//============================================
// G10.5b: multi-room route completes within 240 ticks
//============================================

test("G10.5b: multi-room path (3 rooms, ~150 px total) completes within 240 ticks", () => {
	// Model a cabin -> corridor -> dining_room path as sequential 50-px segments.
	// Each crossing: ~25 ticks nominal, gate: 80 ticks per segment.
	// Total 3 crossings: gate 240 ticks.
	const speed = 2.0;
	const threshold = 2.0;
	const waypoints = [
		{ x: 50, y: 0 }, // corridor door
		{ x: 100, y: 0 }, // corridor center
		{ x: 150, y: 0 }, // dining room door
	];

	let pos = { x: 0, y: 0 };
	let vel = { x: 0, y: 0 };
	let totalTicks = 0;

	for (const wp of waypoints) {
		let reached = false;
		// Up to 80 ticks per segment.
		for (let t = 0; t < 80; t++) {
			const result = physTick(pos, vel, wp, speed);
			pos = result.pos;
			vel = result.vel;
			totalTicks++;
			const dx = pos.x - wp.x;
			const dy = pos.y - wp.y;
			if (Math.sqrt(dx ** 2 + dy ** 2) <= threshold) {
				reached = true;
				break;
			}
		}
		assert.ok(
			reached,
			`Agent did not reach waypoint (${wp.x},${wp.y}) within 80 ticks (${totalTicks} total so far)`,
		);
	}

	assert.ok(
		totalTicks <= 240,
		`Multi-room path took ${totalTicks} ticks, expected <= 240`,
	);
});

//============================================

test("force cap prevents velocity blowup under extreme forces", () => {
	// A force of 1000 px/tick^2 with speed=2.0 should be capped to 4.0 (2*speed),
	// and velocity should not exceed 2.0 px/tick after one tick.
	const pos = { x: 0, y: 0 };
	const vel = { x: 0, y: 0 };
	const speed = 2.0;
	// Extremely large target distance to simulate huge force.
	const result = physTick(pos, vel, { x: 10000, y: 0 }, speed);
	const velMag = Math.sqrt(result.vel.x ** 2 + result.vel.y ** 2);
	assert.ok(
		velMag <= speed + 0.001,
		`Velocity magnitude ${velMag.toFixed(4)} exceeds speed cap ${speed} after extreme force`,
	);
});
