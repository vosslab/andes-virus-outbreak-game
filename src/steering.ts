import type { Point } from "./types/simulation";

// ==============================================
// Helper utilities (not exported)
// ==============================================

/**
 * Add two points componentwise.
 */
function add(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract b from a componentwise.
 */
function sub(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a point by a scalar.
 */
function scale(p: Point, s: number): Point {
	return { x: p.x * s, y: p.y * s };
}

/**
 * Compute magnitude (Euclidean length) of a point treated as a vector.
 */
function magnitude(p: Point): number {
	return Math.sqrt(p.x * p.x + p.y * p.y);
}

/**
 * Return unit vector in the direction of p, or (0,0) if p is zero.
 */
function normalize(p: Point): Point {
	const mag = magnitude(p);
	if (mag === 0) {
		return { x: 0, y: 0 };
	}
	return { x: p.x / mag, y: p.y / mag };
}

/**
 * Euclidean distance between two points.
 */
function distance(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Closest point on a line segment [p0, p1] to query point q.
 */
function closestPointOnSegment(p0: Point, p1: Point, q: Point): Point {
	const dx = p1.x - p0.x;
	const dy = p1.y - p0.y;
	const lenSq = dx * dx + dy * dy;

	if (lenSq === 0) {
		return p0;
	}

	// Parameter t on [0, 1] along the segment.
	const qxMp0x = q.x - p0.x;
	const qyMp0y = q.y - p0.y;
	const t = Math.max(0, Math.min(1, (qxMp0x * dx + qyMp0y * dy) / lenSq));

	return {
		x: p0.x + t * dx,
		y: p0.y + t * dy,
	};
}

// ==============================================
// Steering rules (exported)
// ==============================================

/**
 * Separation: repel from neighbors within desired distance.
 *
 * For each neighbor within desiredDistance, accumulate a force pointing
 * away from the neighbor, scaled by (desiredDistance - distance) / desiredDistance
 * (linear falloff to 0 at desiredDistance).
 *
 * Returns the sum of all repulsion vectors.
 */
export function separation(
	self: Point,
	neighbors: readonly Point[],
	desiredDistance: number,
): Point {
	let force: Point = { x: 0, y: 0 };

	for (const neighbor of neighbors) {
		const dist = distance(self, neighbor);
		if (dist < desiredDistance && dist > 0) {
			const scale_factor = (desiredDistance - dist) / desiredDistance;
			const away = normalize(sub(self, neighbor));
			force = add(force, scale(away, scale_factor));
		}
	}

	return force;
}

/**
 * Alignment: steer toward the mean velocity of neighbors.
 *
 * If neighbors exist, returns mean(neighborVelocities) - selfVelocity.
 * Otherwise returns (0, 0).
 */
export function alignment(selfVelocity: Point, neighborVelocities: readonly Point[]): Point {
	if (neighborVelocities.length === 0) {
		return { x: 0, y: 0 };
	}

	let sum: Point = { x: 0, y: 0 };
	for (const vel of neighborVelocities) {
		sum = add(sum, vel);
	}

	const mean: Point = {
		x: sum.x / neighborVelocities.length,
		y: sum.y / neighborVelocities.length,
	};

	return sub(mean, selfVelocity);
}

/**
 * Cohesion: steer toward the center of mass of neighbors.
 *
 * If neighbors exist, returns mean(neighbors) - self.
 * Otherwise returns (0, 0).
 */
export function cohesion(self: Point, neighbors: readonly Point[]): Point {
	if (neighbors.length === 0) {
		return { x: 0, y: 0 };
	}

	let sum: Point = { x: 0, y: 0 };
	for (const neighbor of neighbors) {
		sum = add(sum, neighbor);
	}

	const mean: Point = {
		x: sum.x / neighbors.length,
		y: sum.y / neighbors.length,
	};

	return sub(mean, self);
}

/**
 * Target seek: steer toward a target with maximum speed.
 *
 * Returns the unit vector from self toward target, scaled by maxSpeed.
 * If self == target, returns (0, 0) to avoid NaN.
 */
export function targetSeek(self: Point, target: Point, maxSpeed: number): Point {
	const dist = distance(self, target);
	if (dist === 0) {
		return { x: 0, y: 0 };
	}

	const direction = normalize(sub(target, self));
	return scale(direction, maxSpeed);
}

/**
 * Obstacle avoidance: repel from nearby wall segments.
 *
 * For each wall segment within lookahead distance from self, accumulate
 * a force vector pointing AWAY from the closest point on the segment,
 * scaled by (lookahead - dist) / lookahead.
 *
 * Returns the sum of all repulsion vectors.
 */
export function obstacleAvoid(
	self: Point,
	polygonWalls: readonly [Point, Point][],
	lookahead: number,
): Point {
	let force: Point = { x: 0, y: 0 };

	for (const [p0, p1] of polygonWalls) {
		const closest = closestPointOnSegment(p0, p1, self);
		const dist = distance(self, closest);

		if (dist < lookahead && dist > 0) {
			const scale_factor = (lookahead - dist) / lookahead;
			const away = normalize(sub(self, closest));
			force = add(force, scale(away, scale_factor));
		}
	}

	return force;
}

/**
 * Doorway bias: steer toward a doorway midpoint.
 *
 * If doorSegment is non-null, returns the unit vector from self toward
 * the door midpoint, scaled by bias.
 * Otherwise returns (0, 0).
 */
export function doorwayBias(
	self: Point,
	doorSegment: readonly [Point, Point] | null,
	bias: number,
): Point {
	if (doorSegment === null) {
		return { x: 0, y: 0 };
	}

	const midpoint: Point = {
		x: (doorSegment[0].x + doorSegment[1].x) / 2,
		y: (doorSegment[0].y + doorSegment[1].y) / 2,
	};

	const dist = distance(self, midpoint);
	if (dist === 0) {
		return { x: 0, y: 0 };
	}

	const direction = normalize(sub(midpoint, self));
	return scale(direction, bias);
}
