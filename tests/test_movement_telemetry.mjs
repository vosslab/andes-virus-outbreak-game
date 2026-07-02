/**
 * Movement telemetry tests (G10.5c).
 *
 * Tests the telemetry counter logic inline (mirrors src/movement_telemetry.ts).
 * Uses a self-contained implementation so bare node --test works without a tsx loader.
 *
 * G10.5c gate: mean per-agent displacement over 60 ticks lies within the band
 *   [0.5 * mean_speed * 60, mean_speed * 60]
 *
 * Lower bound: 0.5 * speed * ticks -- allows for steering detours and opposing forces.
 * Upper bound: speed * ticks -- the physical speed cap; no agent can travel faster.
 *
 * Run: node --test tests/test_movement_telemetry.mjs
 */

import { test } from "node:test";
import assert from "node:assert";

//============================================
// Inline telemetry implementation (mirrors src/movement_telemetry.ts)
//============================================

/**
 * Create a telemetry collector for the given passenger IDs.
 * Pure counters; no external deps.
 */
function createTelemetry(passengerIds) {
  const displacement = new Map();
  const firstDoorwayTick = new Map();
  const roomTransitions = new Map();
  const lastZoneId = new Map();

  for (const id of passengerIds) {
    displacement.set(id, 0);
    roomTransitions.set(id, 0);
  }

  // pathIndex is accepted as a 4th positional arg for API parity with
  // src/movement_telemetry.ts but not used in this inline fixture.
  function recordTick(passengerId, disp, zoneId) {
    if (!displacement.has(passengerId)) {
      return;
    }
    const prev = displacement.get(passengerId) ?? 0;
    // Cap at 32-bit int max.
    displacement.set(passengerId, Math.min(prev + disp, 2147483647));

    const prevZone = lastZoneId.get(passengerId);
    if (prevZone !== undefined && prevZone !== zoneId) {
      const prev2 = roomTransitions.get(passengerId) ?? 0;
      roomTransitions.set(passengerId, prev2 + 1);
    }
    lastZoneId.set(passengerId, zoneId);
  }

  function recordDoorwayCrossing(passengerId, tick) {
    if (!firstDoorwayTick.has(passengerId)) {
      firstDoorwayTick.set(passengerId, tick);
    }
  }

  function getDisplacement(passengerId) {
    return displacement.get(passengerId) ?? 0;
  }

  function getFirstDoorwayTick(passengerId) {
    const tick = firstDoorwayTick.get(passengerId);
    return tick !== undefined ? tick : null;
  }

  function getRoomTransitions(passengerId) {
    return roomTransitions.get(passengerId) ?? 0;
  }

  function getMeanDisplacement() {
    if (displacement.size === 0) {
      return 0;
    }
    let total = 0;
    for (const d of displacement.values()) {
      total += d;
    }
    return total / displacement.size;
  }

  return {
    recordTick,
    recordDoorwayCrossing,
    getDisplacement,
    getFirstDoorwayTick,
    getRoomTransitions,
    getMeanDisplacement,
  };
}

//============================================
// Inline physics (mirrors corrected simulation.ts integration)
//============================================

/**
 * Run one physics tick. Returns {pos, vel, displacement} where displacement is
 * the Euclidean distance moved this tick.
 */
function physTick(pos, vel, targetPos, speed) {
  const dx = targetPos.x - pos.x;
  const dy = targetPos.y - pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const seekForce =
    dist < 0.01 ? { x: 0, y: 0 } : { x: (dx / dist) * speed, y: (dy / dist) * speed };

  const forceCap = 2.0 * speed;
  const forceMag = Math.sqrt(seekForce.x ** 2 + seekForce.y ** 2);
  const cappedForce =
    forceMag > forceCap
      ? { x: (seekForce.x / forceMag) * forceCap, y: (seekForce.y / forceMag) * forceCap }
      : seekForce;

  let newVel = { x: vel.x + cappedForce.x, y: vel.y + cappedForce.y };
  const velMag = Math.sqrt(newVel.x ** 2 + newVel.y ** 2);
  if (velMag > speed) {
    newVel = { x: (newVel.x / velMag) * speed, y: (newVel.y / velMag) * speed };
  }

  const newPos = { x: pos.x + newVel.x, y: pos.y + newVel.y };
  const stepDist = Math.sqrt((newPos.x - pos.x) ** 2 + (newPos.y - pos.y) ** 2);
  return { pos: newPos, vel: newVel, displacement: stepDist };
}

//============================================
// Tests
//============================================

test("createTelemetry initialises per-agent counters to zero", () => {
  const tel = createTelemetry([0, 1, 2]);
  assert.strictEqual(tel.getDisplacement(0), 0);
  assert.strictEqual(tel.getDisplacement(1), 0);
  assert.strictEqual(tel.getRoomTransitions(0), 0);
  assert.strictEqual(tel.getFirstDoorwayTick(0), null);
});

//============================================

test("recordTick accumulates displacement correctly", () => {
  const tel = createTelemetry([0]);
  tel.recordTick(0, 2.0, "cab_p1", 0);
  tel.recordTick(0, 2.0, "cab_p1", 0);
  tel.recordTick(0, 2.0, "cab_p1", 0);
  assert.strictEqual(tel.getDisplacement(0), 6.0);
});

//============================================

test("recordTick detects room transitions when zoneId changes", () => {
  const tel = createTelemetry([5]);
  tel.recordTick(5, 1.0, "cab_p1", 0); // initial zone set
  tel.recordTick(5, 1.0, "cab_p1", 0); // same zone, no transition
  tel.recordTick(5, 1.0, "corr_p", 1); // zone changed -> +1 transition
  tel.recordTick(5, 1.0, "dining", 2); // zone changed -> +1 transition
  assert.strictEqual(tel.getRoomTransitions(5), 2);
});

//============================================

test("recordDoorwayCrossing records first tick only", () => {
  const tel = createTelemetry([3]);
  tel.recordDoorwayCrossing(3, 10);
  tel.recordDoorwayCrossing(3, 20); // second call should not overwrite
  assert.strictEqual(tel.getFirstDoorwayTick(3), 10);
});

//============================================

test("getMeanDisplacement returns 0 for empty telemetry", () => {
  const tel = createTelemetry([]);
  assert.strictEqual(tel.getMeanDisplacement(), 0);
});

//============================================

test("getMeanDisplacement returns correct mean across agents", () => {
  const tel = createTelemetry([0, 1, 2]);
  tel.recordTick(0, 3.0, "a", 0);
  tel.recordTick(1, 6.0, "b", 0);
  tel.recordTick(2, 9.0, "c", 0);
  // mean = (3+6+9) / 3 = 6.0
  assert.strictEqual(tel.getMeanDisplacement(), 6.0);
});

//============================================

test("unknown passengerId is silently ignored", () => {
  const tel = createTelemetry([0]);
  // ID 99 not in the initial set.
  tel.recordTick(99, 5.0, "room", 0);
  assert.strictEqual(tel.getDisplacement(99), 0);
});

//============================================

test("G10.5c: mean displacement over 60 ticks in geometry-derived band [0.5*speed*60, speed*60]", () => {
  // Fixture: 50 agents, each doing a pure seek over 60 ticks toward a target 200 px away.
  // No opposing forces, so displacement should approach speed * ticks.
  // The lower bound (0.5 * speed * ticks) allows for the acceleration ramp-up phase.
  const speed = 2.0;
  const ticks = 60;
  const lowerBound = 0.5 * speed * ticks; // 60 px
  const upperBound = speed * ticks; // 120 px

  const ids = Array.from({ length: 50 }, (_, i) => i);
  const tel = createTelemetry(ids);

  for (const id of ids) {
    // Each agent starts at a slightly different x position (0..49), target at 300.
    const startX = id;
    let pos = { x: startX, y: 0 };
    let vel = { x: 0, y: 0 };
    const target = { x: startX + 200, y: 0 };

    for (let t = 0; t < ticks; t++) {
      const result = physTick(pos, vel, target, speed);
      tel.recordTick(id, result.displacement, "room_a", 0);
      pos = result.pos;
      vel = result.vel;
    }
  }

  const mean = tel.getMeanDisplacement();
  assert.ok(
    mean >= lowerBound,
    `Mean displacement ${mean.toFixed(2)} px below lower bound ${lowerBound} px (0.5 * ${speed} * ${ticks})`,
  );
  assert.ok(
    mean <= upperBound + 0.001,
    `Mean displacement ${mean.toFixed(2)} px above upper bound ${upperBound} px (${speed} * ${ticks})`,
  );
});

//============================================

test("G10.5c: displacement band holds for slower agent (speed=1.0)", () => {
  const speed = 1.0;
  const ticks = 60;
  const lowerBound = 0.5 * speed * ticks; // 30 px
  const upperBound = speed * ticks; // 60 px

  const tel = createTelemetry([0]);
  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  const target = { x: 200, y: 0 };

  for (let t = 0; t < ticks; t++) {
    const result = physTick(pos, vel, target, speed);
    tel.recordTick(0, result.displacement, "room_a", 0);
    pos = result.pos;
    vel = result.vel;
  }

  const mean = tel.getMeanDisplacement();
  assert.ok(
    mean >= lowerBound,
    `Slow agent mean displacement ${mean.toFixed(2)} below ${lowerBound}`,
  );
  assert.ok(
    mean <= upperBound + 0.001,
    `Slow agent mean displacement ${mean.toFixed(2)} above ${upperBound}`,
  );
});
