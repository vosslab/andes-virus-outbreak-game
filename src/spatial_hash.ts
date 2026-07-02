/**
 * Spatial hash grid for O(1) neighbor queries within a fixed radius.
 * Partitions 2D space into square cells; each cell stores a set of entity IDs.
 * Supports insert, remove, move (no-op if same cell), and radius queries.
 *
 * Optional instrumentation: enable counters to track query counts, candidate counts,
 * and rebuild counts. Used for performance budgeting and regression detection.
 */

/**
 * Counters tracking spatial hash operations (queries, candidates, rebuilds).
 * Enables deterministic, CI-friendly performance budgeting without wall-clock timing.
 */
export type SpatialHashCounters = {
  queries: number;
  totalCandidates: number;
  maxCandidates: number;
  rebuilds: number;
};

let globalCounters: SpatialHashCounters | null = null;

/**
 * Enable spatial hash operation counters globally.
 * All SpatialHash instances (new and existing) will increment counters until disabled.
 * Call this before starting a timed operation; call disableCounters() when done.
 *
 * Returns:
 *   The counter object, pre-initialized to zero. The counter object is updated
 *   by subsequent operations on any SpatialHash instance.
 */
export function enableCounters(): SpatialHashCounters {
  globalCounters = {
    queries: 0,
    totalCandidates: 0,
    maxCandidates: 0,
    rebuilds: 0,
  };
  return globalCounters;
}

/**
 * Disable spatial hash operation counters.
 * After this call, subsequent operations do not increment counters.
 */
export function disableCounters(): void {
  globalCounters = null;
}

/**
 * Record a rebuild event in the counters (for tracking index build operations).
 * Called by buildAgentIndex to track when a fresh spatial hash is built.
 */
export function recordRebuild(): void {
  if (globalCounters !== null) {
    globalCounters.rebuilds += 1;
  }
}

/**
 * Spatial hash grid parameterized by ID type.
 * Internally uses a Map<string, Set<T>> keyed by cell coordinates.
 */
export class SpatialHash<T extends string | number> {
  private cellSize: number;
  private buckets: Map<string, Set<T>>;

  /**
   * Construct a spatial hash with a given cell size.
   *
   * Args:
   *   cellSize: size of each grid cell in world units. Larger cells reduce
   *     bucket count; smaller cells reduce candidates per query. Typical range:
   *     contact radius to 2x contact radius.
   */
  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  /**
   * Insert an ID at a given position.
   * If the ID is already in the hash at a different position, this adds it
   * again. Call remove() first if already inserted.
   *
   * Args:
   *   id: entity ID (string or number).
   *   x: world x coordinate.
   *   y: world y coordinate.
   */
  insert(id: T, x: number, y: number): void {
    const key = this.cellKey(x, y);
    const bucket = this.buckets.get(key);
    if (bucket === undefined) {
      this.buckets.set(key, new Set([id]));
    } else {
      bucket.add(id);
    }
  }

  /**
   * Remove an ID from a given position.
   * No-op if the ID is not in that bucket.
   *
   * Args:
   *   id: entity ID.
   *   x: world x coordinate of the ID's current position.
   *   y: world y coordinate of the ID's current position.
   */
  remove(id: T, x: number, y: number): void {
    const key = this.cellKey(x, y);
    const bucket = this.buckets.get(key);
    if (bucket !== undefined) {
      bucket.delete(id);
      if (bucket.size === 0) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Move an ID from one position to another, removing from old bucket if it changes.
   * If the old and new positions are in the same cell, this is a no-op.
   *
   * Args:
   *   id: entity ID.
   *   oldX: previous world x coordinate.
   *   oldY: previous world y coordinate.
   *   newX: new world x coordinate.
   *   newY: new world y coordinate.
   */
  move(id: T, oldX: number, oldY: number, newX: number, newY: number): void {
    const oldKey = this.cellKey(oldX, oldY);
    const newKey = this.cellKey(newX, newY);

    // If in the same cell, no-op.
    if (oldKey === newKey) {
      return;
    }

    // Remove from old bucket.
    const oldBucket = this.buckets.get(oldKey);
    if (oldBucket !== undefined) {
      oldBucket.delete(id);
      if (oldBucket.size === 0) {
        this.buckets.delete(oldKey);
      }
    }

    // Insert into new bucket.
    const newBucket = this.buckets.get(newKey);
    if (newBucket === undefined) {
      this.buckets.set(newKey, new Set([id]));
    } else {
      newBucket.add(id);
    }
  }

  /**
   * Query all IDs whose bucket overlaps a circular region.
   * Returns all IDs in any bucket that the query circle intersects,
   * in sorted order (by id, ascending). Caller must filter by exact distance.
   *
   * Args:
   *   x: world x coordinate of the circle center.
   *   y: world y coordinate of the circle center.
   *   radius: radius of the query circle in world units.
   *
   * Returns:
   *   A readonly array of IDs in deterministic (sorted) order.
   */
  query(x: number, y: number, radius: number): readonly T[] {
    const results: T[] = [];
    const cellMinX = Math.floor((x - radius) / this.cellSize);
    const cellMaxX = Math.floor((x + radius) / this.cellSize);
    const cellMinY = Math.floor((y - radius) / this.cellSize);
    const cellMaxY = Math.floor((y + radius) / this.cellSize);

    // Iterate over all cells that the query circle might overlap.
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

    // Sort for determinism.
    results.sort((a, b) => {
      if (typeof a === "string" && typeof b === "string") {
        return a.localeCompare(b);
      }
      return Number(a) - Number(b);
    });

    // Instrumentation: update counters if enabled.
    if (globalCounters !== null) {
      globalCounters.queries += 1;
      globalCounters.totalCandidates += results.length;
      if (results.length > globalCounters.maxCandidates) {
        globalCounters.maxCandidates = results.length;
      }
    }

    return results;
  }

  /**
   * Clear all buckets.
   * Instrumentation: records a rebuild event (called once per tick to reinitialize the hash).
   */
  clear(): void {
    this.buckets.clear();

    // Instrumentation: track rebuild events.
    if (globalCounters !== null) {
      globalCounters.rebuilds += 1;
    }
  }

  /**
   * Compute the cell key for a given world position.
   * Args:
   *   x: world x coordinate.
   *   y: world y coordinate.
   * Returns:
   *   A string key in the form "cellX,cellY".
   */
  private cellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }
}
