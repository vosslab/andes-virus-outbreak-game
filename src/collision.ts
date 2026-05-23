import type { Point } from "./types/simulation";

// ==============================================
// Helper utilities
// ==============================================

/**
 * Computes the Euclidean distance between two points.
 */
function distance(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes the magnitude of a vector (point).
 */
function magnitude(p: Point): number {
	return Math.sqrt(p.x * p.x + p.y * p.y);
}

/**
 * Normalizes a vector to unit length. Returns (0,0) if magnitude is zero.
 */
function normalize(p: Point): Point {
	const mag = magnitude(p);
	if (mag === 0) {
		return { x: 0, y: 0 };
	}
	return { x: p.x / mag, y: p.y / mag };
}

/**
 * Subtracts vector b from vector a componentwise.
 */
function sub(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scales a vector by a scalar.
 */
function scale(p: Point, s: number): Point {
	return { x: p.x * s, y: p.y * s };
}

/**
 * Adds two vectors componentwise.
 */
function add(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Computes the cross product of vectors a and b (treating them as 2D).
 * Returns a scalar: a.x * b.y - a.y * b.x.
 */
function cross2d(a: Point, b: Point): number {
	return a.x * b.y - a.y * b.x;
}

// ==============================================
// Point-in-polygon test
// ==============================================

/**
 * Tests whether a point is strictly inside a polygon using the ray-cast algorithm.
 *
 * Algorithm: cast a ray from the point to infinity (in the +x direction) and count
 * how many polygon edges it crosses. If the count is odd, the point is inside.
 * Returns true if the point is inside, false otherwise.
 *
 * Polygon vertices should be in counter-clockwise (CCW) order.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
	const { x, y } = point;
	let inside = false;

	for (let i = 0; i < polygon.length; i++) {
		const p0 = polygon[i];
		const p1 = polygon[(i + 1) % polygon.length];

		if (!p0 || !p1) {
			continue;
		}

		// Check if the edge from p0 to p1 intersects the ray from point going right (+x).
		// The ray is at height y and goes from x to +infinity.
		// The edge goes from (p0.x, p0.y) to (p1.x, p1.y).

		// Only count edges that straddle the ray's y-coordinate.
		if (p0.y > y !== p1.y > y) {
			// Compute x-coordinate where the edge crosses y = point.y.
			// Edge parametric form: (1-t) * p0 + t * p1, t in [0, 1].
			// Solve: (1-t) * p0.y + t * p1.y = y
			// => t = (y - p0.y) / (p1.y - p0.y)
			const t = (y - p0.y) / (p1.y - p0.y);
			const xIntersect = p0.x + t * (p1.x - p0.x);

			// If the intersection is to the right of the point, toggle inside.
			if (x < xIntersect) {
				inside = !inside;
			}
		}
	}

	return inside;
}

// ==============================================
// Segment intersection test
// ==============================================

/**
 * Tests whether two line segments intersect and returns the intersection point if they do.
 *
 * Segments:
 *   seg1: from seg1[0] to seg1[1]
 *   seg2: from seg2[0] to seg2[1]
 *
 * Algorithm: parametric form. Seg1 = p + t * d1, seg2 = q + s * d2, t,s in [0,1].
 * Solve for intersection: p + t * d1 = q + s * d2
 *
 * Returns the intersection point if the segments intersect, null otherwise.
 */
export function segmentsCross(
	seg1: readonly [Point, Point],
	seg2: readonly [Point, Point],
): Point | null {
	const p = seg1[0];
	const p_end = seg1[1];
	const q = seg2[0];
	const q_end = seg2[1];

	const d1 = sub(p_end, p);
	const d2 = sub(q_end, q);
	const pq = sub(q, p);

	const denom = cross2d(d1, d2);

	// If denom == 0, segments are parallel or collinear.
	if (denom === 0) {
		return null;
	}

	const t = cross2d(pq, d2) / denom;
	const s = cross2d(pq, d1) / denom;

	// Both t and s must be in [0, 1] for intersection within the segments.
	if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
		// Compute intersection point using t.
		return add(p, scale(d1, t));
	}

	return null;
}

// ==============================================
// Door segment overlap test
// ==============================================

/**
 * Tests whether a wall segment overlaps with any door segment.
 *
 * A wall segment overlaps a door if the midpoint of the wall segment
 * is within epsilon distance of any door segment.
 *
 * This allows movement through a permeable door opening even though
 * the door segment is technically part of the wall polygon.
 */
function segmentOverlapsDoor(
	wallSeg: readonly [Point, Point],
	doorSegs: readonly (readonly [Point, Point])[],
	epsilon: number,
): boolean {
	// Midpoint of the wall segment.
	const midpoint: Point = {
		x: (wallSeg[0].x + wallSeg[1].x) / 2,
		y: (wallSeg[0].y + wallSeg[1].y) / 2,
	};

	for (const doorSeg of doorSegs) {
		const doorMid: Point = {
			x: (doorSeg[0].x + doorSeg[1].x) / 2,
			y: (doorSeg[0].y + doorSeg[1].y) / 2,
		};

		const dist = distance(midpoint, doorMid);
		if (dist <= epsilon) {
			return true;
		}
	}

	return false;
}

// ==============================================
// Main collision function
// ==============================================

/**
 * Steps from currentPos toward candidatePos while respecting polygon walls.
 *
 * Algorithm:
 *   a. If candidatePos is inside the polygon, return candidatePos unchanged.
 *   b. Otherwise, find the polygon edge that the path (currentPos -> candidatePos) crosses.
 *   c. If the crossed edge overlaps a door segment (within 2-pixel epsilon), allow passage.
 *   d. If the crossed edge is a wall (no door overlap), clamp candidatePos to stay just inside
 *      the polygon by projecting onto the crossed edge with a 1-pixel inward buffer.
 *
 * Returns the final position (either candidatePos if inside, or clamped position if outside).
 *
 * Polygon vertices should be in CCW order. Door segments are provided as a list of
 * [Point, Point] tuples representing door openings in the wall.
 */
export function stepWithCollision(
	currentPos: Point,
	candidatePos: Point,
	currentZonePolygon: readonly Point[],
	doorSegments: readonly (readonly [Point, Point])[],
): Point {
	// Check if candidate is already inside the polygon.
	if (pointInPolygon(candidatePos, currentZonePolygon)) {
		return candidatePos;
	}

	// Candidate is outside. Find the edge that the movement path crosses.
	const movementPath: [Point, Point] = [currentPos, candidatePos];

	for (let i = 0; i < currentZonePolygon.length; i++) {
		const p0 = currentZonePolygon[i];
		const p1 = currentZonePolygon[(i + 1) % currentZonePolygon.length];

		if (!p0 || !p1) {
			continue;
		}

		const wallEdge: [Point, Point] = [p0, p1];

		// Check if the movement path crosses this wall edge.
		const intersection = segmentsCross(movementPath, wallEdge);
		if (intersection !== null) {
			// Movement path crosses this wall edge.
			// Check if the crossing point is near a door segment (epsilon = 2 pixels).
			if (segmentOverlapsDoor(wallEdge, doorSegments, 2)) {
				// Door overlap: allow passage through the door.
				return candidatePos;
			}

			// True wall: clamp candidatePos to the polygon.
			// Project candidatePos onto the wall edge, then move 1 pixel inward.
			const projected = projectPointOntoSegment(candidatePos, wallEdge);

			// Compute the inward direction (from wall toward polygon interior).
			// For a CCW polygon, the inward direction is 90 degrees counter-clockwise from
			// the edge direction.
			const edgeDir = normalize(sub(p1, p0));
			const inwardDir: Point = { x: -edgeDir.y, y: edgeDir.x };

			// Move 1 pixel inward from the projected point, with fallback to 0.5 if precision issues.
			const clamped = add(projected, scale(inwardDir, 1));

			// Verify clamped is inside the polygon; if not due to floating point error, use 0.5 pixels.
			if (!pointInPolygon(clamped, currentZonePolygon)) {
				return add(projected, scale(inwardDir, 0.5));
			}

			return clamped;
		}
	}

	// No wall edge was crossed (edge case: movement entirely outside polygon).
	// Return current position to prevent exiting (conservative fallback).
	// If somehow we got here with candidate outside, stay at current.
	if (!pointInPolygon(currentPos, currentZonePolygon)) {
		// Both current and candidate are outside; this shouldn't happen in normal movement.
		// Clamp both to be safe.
		return clampToPolygon(currentPos, currentZonePolygon);
	}
	return currentPos;
}

// ==============================================
// Helper: project point onto segment
// ==============================================

/**
 * Projects a point onto a line segment, returning the closest point on the segment.
 */
function projectPointOntoSegment(point: Point, segment: readonly [Point, Point]): Point {
	const p0 = segment[0];
	const p1 = segment[1];

	const dx = p1.x - p0.x;
	const dy = p1.y - p0.y;
	const lenSq = dx * dx + dy * dy;

	if (lenSq === 0) {
		return p0;
	}

	const t = Math.max(0, Math.min(1, ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / lenSq));

	return {
		x: p0.x + t * dx,
		y: p0.y + t * dy,
	};
}

// ==============================================
// Helper: clamp point to polygon boundary
// ==============================================

/**
 * Clamps a point that is outside the polygon to the closest point on the polygon boundary.
 * This is a fallback for edge cases where the movement path does not clearly cross a single edge.
 */
function clampToPolygon(point: Point, polygon: readonly Point[]): Point {
	const firstPoint = polygon[0];
	if (!firstPoint) {
		return point;
	}

	let closestPoint = firstPoint;
	let minDist = distance(point, closestPoint);

	// Check all polygon edges.
	for (let i = 0; i < polygon.length; i++) {
		const p0 = polygon[i];
		const p1 = polygon[(i + 1) % polygon.length];

		if (!p0 || !p1) {
			continue;
		}

		const seg: [Point, Point] = [p0, p1];
		const proj = projectPointOntoSegment(point, seg);
		const dist = distance(point, proj);

		if (dist < minDist) {
			minDist = dist;
			closestPoint = proj;
		}
	}

	// Move 1 pixel inward from the closest boundary point.
	// Estimate inward direction as the direction from closestPoint toward polygon center.
	let centerX = 0;
	let centerY = 0;
	for (const p of polygon) {
		centerX += p.x;
		centerY += p.y;
	}
	centerX /= polygon.length;
	centerY /= polygon.length;

	const center: Point = { x: centerX, y: centerY };
	const inwardDir = normalize(sub(center, closestPoint));

	// Try 1 pixel first, then 0.5 if precision issues.
	const clamped1 = add(closestPoint, scale(inwardDir, 1));
	if (pointInPolygon(clamped1, polygon)) {
		return clamped1;
	}

	return add(closestPoint, scale(inwardDir, 0.5));
}
