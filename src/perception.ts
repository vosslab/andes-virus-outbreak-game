/**
 * Perception and neighbor-detection helpers for agents using spatial hashing.
 * Provides queries to find nearby passenger IDs within a radius and compute
 * exact distances for filtering.
 */

import type { Passenger } from "./types/simulation";
import { SpatialHash, recordRebuild } from "./spatial_hash";

//============================================

/**
 * Build a spatial hash index from an array of passengers.
 *
 * Args:
 *   passengers: array of passengers to index.
 *   cellSize: size of each spatial hash cell in world units.
 *
 * Returns:
 *   A SpatialHash<number> mapping each passenger id to its current position.
 *   The caller owns the returned index and must update it when passengers move.
 *
 * Instrumentation:
 *   If spatial hash counters are enabled, records a rebuild event (since building
 *   a fresh index is semantically equivalent to a "rebuild" for perf tracking).
 */
export function buildAgentIndex(
  passengers: readonly Passenger[],
  cellSize: number,
): SpatialHash<number> {
  const index = new SpatialHash<number>(cellSize);
  for (const passenger of passengers) {
    index.insert(passenger.id, passenger.position.x, passenger.position.y);
  }

  // Instrumentation: record the rebuild event.
  recordRebuild();

  return index;
}

//============================================

/**
 * Query all neighbor passenger IDs within a radius, excluding the agent itself.
 *
 * This is a low-level query that returns all IDs in buckets overlapping the radius.
 * The caller must perform exact-distance filtering if needed. Results are sorted
 * by ID ascending for determinism.
 *
 * Args:
 *   index: the spatial hash index built from buildAgentIndex().
 *   passenger: the querying agent.
 *   radius: search radius in world units.
 *
 * Returns:
 *   Readonly array of neighbor passenger IDs (excluding the agent itself),
 *   sorted by ID ascending.
 */
export function queryNeighborIds(
  index: SpatialHash<number>,
  passenger: Passenger,
  radius: number,
): readonly number[] {
  const candidates = index.query(passenger.position.x, passenger.position.y, radius);

  // Filter out self.
  const result = candidates.filter((id) => id !== passenger.id);
  return result;
}

//============================================

/**
 * Query all neighbors within an exact distance, sorted by distance then ID.
 *
 * Combines spatial hash query with exact Euclidean distance filtering.
 * Returns neighbors sorted by distance ascending, with ID as tiebreaker.
 *
 * Args:
 *   passengers: array of all passengers (used to compute exact distances).
 *   index: the spatial hash index.
 *   passenger: the querying agent.
 *   radius: search radius in world units.
 *
 * Returns:
 *   Readonly array of { id: number; distance: number } objects sorted by
 *   distance ascending, then id ascending. Self is excluded.
 */
export function queryNeighborsWithinDistance(
  passengers: readonly Passenger[],
  index: SpatialHash<number>,
  passenger: Passenger,
  radius: number,
): readonly { id: number; distance: number }[] {
  const candidates = index.query(passenger.position.x, passenger.position.y, radius);

  // Build a map for quick lookup.
  const passengerMap = new Map<number, Passenger>();
  for (const p of passengers) {
    passengerMap.set(p.id, p);
  }

  // Compute exact distances and filter by radius.
  const results: { id: number; distance: number }[] = [];
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

  // Sort by distance, then by id.
  results.sort((a, b) => {
    const distDiff = a.distance - b.distance;
    if (distDiff !== 0) {
      return distDiff;
    }
    return a.id - b.id;
  });

  return results;
}
