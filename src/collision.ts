import type { Point, Passenger } from "./types/simulation";
import type { SpatialHash } from "./spatial_hash";

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
 * Tests whether a movement path crosses through a door opening.
 *
 * The wall segment (a zone polygon edge) is checked against each door segment.
 * A door allows passage if the movement path's crossing point lies within the
 * door segment's range along the shared wall axis.
 *
 * Algorithm:
 *   1. Find where the movement path intersects the wall segment (intersection point).
 *   2. For each door segment, check if the intersection point lies on the door
 *      segment (i.e., is within the door's x- or y-range with a small tolerance).
 *
 * This replaces the older midpoint-distance heuristic, which failed when doors
 * were not centered on their wall segment (epsilon=2 was too tight).
 *
 * epsilon: tolerance in pixels for the point-on-segment check (default 2px).
 */
function segmentOverlapsDoor(
  wallSeg: readonly [Point, Point],
  doorSegs: readonly (readonly [Point, Point])[],
  epsilon: number,
  movementPath?: readonly [Point, Point],
): boolean {
  // Compute the crossing point of the movement path with the wall segment.
  // If movementPath is not provided, fall back to using the wall segment midpoint.
  let crossPoint: Point;
  if (movementPath !== undefined) {
    const intersection = segmentsCross(
      [movementPath[0], movementPath[1]],
      [wallSeg[0], wallSeg[1]],
    );
    if (intersection !== null) {
      crossPoint = intersection;
    } else {
      // No intersection found; use wall midpoint as fallback.
      crossPoint = {
        x: (wallSeg[0].x + wallSeg[1].x) / 2,
        y: (wallSeg[0].y + wallSeg[1].y) / 2,
      };
    }
  } else {
    crossPoint = {
      x: (wallSeg[0].x + wallSeg[1].x) / 2,
      y: (wallSeg[0].y + wallSeg[1].y) / 2,
    };
  }

  // Check if the crossing point lies on any door segment.
  for (const doorSeg of doorSegs) {
    // Compute the minimum distance from the crossing point to the door segment.
    const projected = projectPointOntoSegmentInternal(crossPoint, doorSeg);
    const dist = distance(crossPoint, projected);
    if (dist <= epsilon) {
      return true;
    }
  }

  return false;
}

/**
 * Internal: projects a point onto a segment, returning the closest point on the segment.
 * Used by segmentOverlapsDoor without exporting.
 */
function projectPointOntoSegmentInternal(point: Point, segment: readonly [Point, Point]): Point {
  const p0 = segment[0];
  const p1 = segment[1];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return p0;
  }
  const t = Math.max(0, Math.min(1, ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / lenSq));
  return { x: p0.x + t * dx, y: p0.y + t * dy };
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
      // Check if the crossing point falls within a door segment (epsilon = 2 pixels).
      // Pass the movement path so the function uses the exact crossing point rather
      // than the wall midpoint (which may be far from the door if the wall is wide).
      if (segmentOverlapsDoor(wallEdge, doorSegments, 2, movementPath)) {
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

// ==============================================
// Passenger-vs-passenger overlap resolution (M10.5)
// ==============================================

/**
 * Resolves pairwise passenger overlaps using a two-pass relaxation loop.
 *
 * After each tick's polygon-clamp step, two or more passengers can have their
 * centers closer than 2 * radius. This function pushes overlapping pairs apart
 * along their connecting axis (half the overlap distance each), then re-clamps
 * the pushed agent back inside its current room polygon to prevent wall penetration.
 *
 * Algorithm:
 *   1. Build a mutable position map from the input array.
 *   2. For each relaxation pass (max MAX_RELAXATION_PASSES = 2):
 *      a. Sort agents by ID (deterministic order, required for seed reproducibility).
 *      b. For each agent A, query spatial hash for neighbors within 2 * radius.
 *      c. For each overlapping neighbor B (dist < 2 * radius), push A and B
 *         apart by half the overlap along their connecting axis.
 *      d. Clamp each pushed position back inside its room polygon.
 *   3. Assemble and return updated Passenger objects with new positions.
 *
 * Edge cases:
 *   - Coincident centers (dist === 0): push along +x by the full diameter to
 *     guarantee separation (deterministic tiebreak via id order).
 *   - Post-push polygon re-clamp: if the clamped position is still overlapping,
 *     accept the residual; the strict gate is "no exact-center coincidence", not
 *     "always separated by >= 2*r" under dense conditions (per plan risk RH4).
 *
 * Args:
 *   passengers: current passenger array (immutable Passenger objects).
 *   spatialHash: pre-built index of passenger IDs -> positions.
 *   radius: agent physical radius (px). Overlap when dist < 2 * radius.
 *   getPolygon: function that returns the room polygon for a given zoneId.
 *     Used for post-push wall re-clamp. Pass null to skip polygon re-clamp
 *     (useful in tests with no room geometry).
 *
 * Returns:
 *   New array of Passenger objects with updated positions. Non-overlapping agents
 *   are returned unchanged (same object reference).
 */
export function resolveOverlaps(
  passengers: readonly Passenger[],
  spatialHash: SpatialHash<number>,
  radius: number,
  getPolygon: ((zoneId: string) => readonly Point[]) | null,
): readonly Passenger[] {
  // MAX_RELAXATION_PASSES bounds the cost per tick (plan: 2 iterations).
  const MAX_RELAXATION_PASSES = 2;
  // Minimum separation distance: 2 * radius, with a tiny epsilon to avoid
  // floating-point equality at the boundary.
  const minSep = 2.0 * radius;

  // Mutable position map for in-pass updates, keyed by passenger id.
  const positions = new Map<number, Point>();
  for (const p of passengers) {
    positions.set(p.id, p.position);
  }

  // Build an id-ordered array for deterministic iteration.
  const sortedIds = passengers.map((p) => p.id).sort((a, b) => a - b);

  for (let pass = 0; pass < MAX_RELAXATION_PASSES; pass++) {
    for (const idA of sortedIds) {
      const posA = positions.get(idA);
      if (posA === undefined) {
        continue;
      }

      // Query spatial hash for candidate neighbors within 2 * radius.
      // The spatial hash holds original positions, so results are approximate.
      // We do exact-distance filtering ourselves below.
      const candidates = spatialHash.query(posA.x, posA.y, minSep);

      for (const idB of candidates) {
        if (idB <= idA) {
          // Process each pair once per pass (lower id owns the push).
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
          // No overlap; skip.
          continue;
        }

        // Overlap detected. Compute push direction and magnitude.
        let normX: number;
        let normY: number;

        if (dist < 0.001) {
          // Coincident centers: push A leftward, B rightward (deterministic tiebreak).
          normX = 1.0;
          normY = 0.0;
        } else {
          normX = dx / dist;
          normY = dy / dist;
        }

        // Each agent moves half the overlap distance.
        const overlap = minSep - dist;
        const pushHalf = overlap / 2.0;

        let newPosA: Point = {
          x: posA.x - normX * pushHalf,
          y: posA.y - normY * pushHalf,
        };
        let newPosB: Point = {
          x: posB.x + normX * pushHalf,
          y: posB.y + normY * pushHalf,
        };

        // Re-clamp pushed positions inside their room polygons (wall penetration guard).
        if (getPolygon !== null) {
          const passengerA = passengers.find((p) => p.id === idA);
          const passengerB = passengers.find((p) => p.id === idB);
          if (passengerA !== undefined) {
            const polyA = getPolygon(passengerA.zoneId);
            if (!pointInPolygon(newPosA, polyA)) {
              // Clamp A back to boundary.
              newPosA = clampToPolygon(newPosA, polyA);
            }
          }
          if (passengerB !== undefined) {
            const polyB = getPolygon(passengerB.zoneId);
            if (!pointInPolygon(newPosB, polyB)) {
              newPosB = clampToPolygon(newPosB, polyB);
            }
          }
        }

        positions.set(idA, newPosA);
        positions.set(idB, newPosB);
      }
    }
  }

  // Assemble updated passenger array. Reuse original object if position unchanged.
  const result: Passenger[] = [];

  for (const p of passengers) {
    const newPos = positions.get(p.id);
    if (newPos !== undefined && (newPos.x !== p.position.x || newPos.y !== p.position.y)) {
      result.push({ ...p, position: newPos });
    } else {
      result.push(p);
    }
  }

  return result;
}
