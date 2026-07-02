import type { Point, ZoneId } from "./types/ship.js";
import { SHIP_LAYOUT } from "./ship_layout.generated.js";

//============================================
// Types
//============================================

/**
 * Represents a directed edge from one zone to another through a door.
 * Includes the door identifier, destination zone, and the location of the
 * waypoint (center of the door opening) for path planning.
 */
export type RoomEdge = {
  readonly doorId: string;
  readonly toZoneId: ZoneId;
  readonly waypoint: Point;
  readonly segment: readonly [Point, Point];
};

/**
 * Adjacency map representation of the ship's room connectivity.
 * Maps each zone ID to a list of outgoing edges (doors leading out).
 * Bidirectional doors result in edges in both directions.
 */
export type RoomGraph = ReadonlyMap<ZoneId, readonly RoomEdge[]>;

//============================================
// Memoization cache
//============================================

let ROOM_GRAPH_CACHE: RoomGraph | undefined;

//============================================
// Core functions
//============================================

/**
 * Computes the room-to-room adjacency graph from the ship layout.
 * Each door creates two directed edges (one for each direction) since
 * force-field doors are bidirectional.
 *
 * Doors whose IDs appear in closedDoors are excluded before building edges.
 * This implements the X2 stateless closed-door contract: doors are filtered
 * once at navmesh init time, never per tick.
 *
 * Returns a ReadonlyMap where keys are zone IDs and values are arrays
 * of RoomEdge objects representing doors leaving that zone.
 */
export function buildRoomGraph(closedDoors?: ReadonlySet<string>): RoomGraph {
  const graph = new Map<ZoneId, RoomEdge[]>();

  // Initialize graph with all zones.
  for (const zone of SHIP_LAYOUT.zones) {
    graph.set(zone.id, []);
  }

  // Add edges for each door in both directions, skipping closed doors.
  for (const door of SHIP_LAYOUT.doors) {
    // Skip doors excluded by this scenario's closed_doors list.
    if (closedDoors && closedDoors.has(door.id)) {
      continue;
    }

    const [roomA, roomB] = door.roomIds;

    // Compute waypoint as midpoint of door segment.
    const waypoint = computeWaypoint(door.segment);

    // Add edge from A to B.
    const edgeAtoB: RoomEdge = {
      doorId: door.id,
      toZoneId: roomB,
      waypoint,
      segment: door.segment,
    };
    const edgesFromA = graph.get(roomA);
    if (edgesFromA) {
      edgesFromA.push(edgeAtoB);
    }

    // Add edge from B to A.
    const edgeBtoA: RoomEdge = {
      doorId: door.id,
      toZoneId: roomA,
      waypoint,
      segment: door.segment,
    };
    const edgesFromB = graph.get(roomB);
    if (edgesFromB) {
      edgesFromB.push(edgeBtoA);
    }
  }

  return new Map(graph);
}

/**
 * Initializes the navmesh with a specific set of closed doors.
 * Replaces the module-level room graph cache and clears the path cache.
 * Call once at simulation init time (e.g., createInitialSimulation).
 * Stateless at runtime: door set is fixed for the lifetime of the simulation.
 *
 * Args:
 *   closedDoors: Array of door IDs to exclude from the navmesh.
 *                Pass an empty array (or omit) for the default open layout.
 */
export function initNavmesh(closedDoors: readonly string[]): void {
  // Build the closed-door set for O(1) lookup during graph construction.
  const closedSet = closedDoors.length > 0 ? new Set(closedDoors) : undefined;
  // Rebuild the room graph with the filtered door set.
  ROOM_GRAPH_CACHE = buildRoomGraph(closedSet);
  // Clear the path cache so old paths are not reused with the new graph.
  PATH_CACHE.clear();
}

/**
 * Returns the memoized room graph, initializing it on first call.
 * Subsequent calls return the same Map object (deterministic identity).
 * Use initNavmesh() to reinitialize with a specific closed-door set.
 */
export function getRoomGraph(): RoomGraph {
  if (ROOM_GRAPH_CACHE === undefined) {
    ROOM_GRAPH_CACHE = buildRoomGraph();
  }
  return ROOM_GRAPH_CACHE;
}

/**
 * Returns the list of outgoing edges from a given zone.
 * Returns an empty array if the zone has no doors or does not exist.
 * Does not throw for missing zones (isolated zones are valid).
 */
export function getEdgesFrom(zoneId: ZoneId): readonly RoomEdge[] {
  const graph = getRoomGraph();
  const edges = graph.get(zoneId);
  return edges ?? [];
}

//============================================
// Path planning cache
//============================================

const PATH_CACHE: Map<string, readonly ZoneId[] | null> = new Map();

//============================================
// Path planning functions
//============================================

/**
 * Plans a room-to-room path using distance-weighted A* search.
 * Returns the shortest path (sequence of zone IDs) from fromZoneId to toZoneId.
 * Edge weight is the Euclidean distance between zone centers.
 * Returns null if the destination is unreachable (isolated zones).
 * Returns [fromZoneId] if from === to.
 * Results are memoized per (from, to) pair.
 */
export function planRoomPath(fromZoneId: ZoneId, toZoneId: ZoneId): readonly ZoneId[] | null {
  // Trivial case: already at destination.
  if (fromZoneId === toZoneId) {
    return [fromZoneId];
  }

  // Check cache.
  const cacheKey = `${fromZoneId}->${toZoneId}`;
  const cached = PATH_CACHE.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // A* search.
  const result = performAStarSearch(fromZoneId, toZoneId);

  // Memoize result.
  PATH_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Clears the path planning cache. Used for testing.
 */
export function clearPathCache(): void {
  PATH_CACHE.clear();
}

/**
 * Returns the next waypoint target along the given path.
 * If pathIndex < path.length - 1, returns the door midpoint from current zone
 * to the next zone in the path.
 * If pathIndex === path.length - 1 (at destination), returns goalZoneCenter.
 * Throws if currentZoneId does not match path[pathIndex] (replan needed).
 */
export function nextWaypoint(
  currentZoneId: ZoneId,
  path: readonly ZoneId[],
  pathIndex: number,
  goalZoneCenter: Point,
): Point {
  // Verify that currentZoneId matches the path at pathIndex.
  if (pathIndex >= path.length || path[pathIndex] !== currentZoneId) {
    throw new Error(
      `Replan required: currentZoneId ${currentZoneId} does not match path[${pathIndex}]`,
    );
  }

  // If we're at the last zone in the path, return the goal center.
  if (pathIndex === path.length - 1) {
    return goalZoneCenter;
  }

  // Otherwise, return the door midpoint to the next zone.
  const nextZoneId = path[pathIndex + 1];
  const edges = getEdgesFrom(currentZoneId);

  for (const edge of edges) {
    if (edge.toZoneId === nextZoneId) {
      return edge.waypoint;
    }
  }

  // Should not reach here if path is valid.
  throw new Error(`No door found from ${currentZoneId} to ${nextZoneId}`);
}

//============================================
// Helper functions
//============================================

/**
 * Computes the waypoint (midpoint) of a door segment.
 * Used as the navigation target through a door opening.
 */
function computeWaypoint(segment: readonly [Point, Point]): Point {
  const midX = (segment[0].x + segment[1].x) / 2;
  const midY = (segment[0].y + segment[1].y) / 2;
  return {
    x: midX,
    y: midY,
  };
}

/**
 * Euclidean distance between two points.
 */
function euclideanDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Performs A* search from start to goal.
 * Heuristic: Euclidean distance from current zone center to goal zone center.
 * Returns the path (sequence of zone IDs) or null if unreachable.
 */
function performAStarSearch(startZoneId: ZoneId, goalZoneId: ZoneId): readonly ZoneId[] | null {
  const graph = getRoomGraph();

  // Get zone centers for heuristic.
  const zoneMap = new Map<ZoneId, Point>();
  for (const zone of SHIP_LAYOUT.zones) {
    zoneMap.set(zone.id, zone.center);
  }

  const startCenter = zoneMap.get(startZoneId);
  const goalCenter = zoneMap.get(goalZoneId);

  if (!startCenter || !goalCenter) {
    return null;
  }

  // Priority queue: list of [zoneId, fScore].
  // For simplicity, use array and re-sort (small graph, acceptable).
  type Node = {
    readonly zoneId: ZoneId;
    readonly fScore: number;
    readonly gScore: number;
    readonly parent: ZoneId | null;
  };

  const openSet: Node[] = [
    {
      zoneId: startZoneId,
      fScore: euclideanDistance(startCenter, goalCenter),
      gScore: 0,
      parent: null,
    },
  ];
  const openSetIds = new Set<ZoneId>([startZoneId]);
  const closedSet = new Set<ZoneId>();
  const gScores = new Map<ZoneId, number>([[startZoneId, 0]]);
  const parents = new Map<ZoneId, ZoneId | null>([[startZoneId, null]]);

  while (openSet.length > 0) {
    // Find node with lowest fScore.
    let bestIndex = 0;
    let best = openSet[0];
    if (!best) {
      break;
    }

    for (let i = 1; i < openSet.length; i++) {
      const candidate = openSet[i];
      if (candidate && candidate.fScore < best.fScore) {
        bestIndex = i;
        best = candidate;
      }
    }

    const current = best;
    openSet.splice(bestIndex, 1);
    openSetIds.delete(current.zoneId);

    // Goal reached.
    if (current.zoneId === goalZoneId) {
      return reconstructPath(parents, goalZoneId);
    }

    closedSet.add(current.zoneId);

    // Explore neighbors.
    const currentZoneId = current.zoneId;
    const currentCenter = zoneMap.get(currentZoneId);
    if (!currentCenter) {
      continue;
    }

    const edges = graph.get(currentZoneId) ?? [];
    for (const edge of edges) {
      const neighborId = edge.toZoneId;

      if (closedSet.has(neighborId)) {
        continue;
      }

      // Edge weight: Euclidean distance between zone centers.
      const neighborCenter = zoneMap.get(neighborId);
      if (!neighborCenter) {
        continue;
      }
      const edgeWeight = euclideanDistance(currentCenter, neighborCenter);

      const tentativeGScore = (gScores.get(currentZoneId) ?? 0) + edgeWeight;
      const currentGScore = gScores.get(neighborId);

      if (currentGScore !== undefined && tentativeGScore >= currentGScore) {
        continue;
      }

      // Update parent and scores.
      parents.set(neighborId, currentZoneId);
      gScores.set(neighborId, tentativeGScore);

      const hScore = euclideanDistance(neighborCenter, goalCenter);
      const fScore = tentativeGScore + hScore;

      if (!openSetIds.has(neighborId)) {
        openSet.push({
          zoneId: neighborId,
          fScore,
          gScore: tentativeGScore,
          parent: currentZoneId,
        });
        openSetIds.add(neighborId);
      } else {
        // Update existing node in openSet (inefficient but small graph).
        const nodeIndex = openSet.findIndex((n) => n.zoneId === neighborId);
        if (nodeIndex >= 0) {
          const existingNode = openSet[nodeIndex];
          if (existingNode) {
            openSet[nodeIndex] = {
              zoneId: neighborId,
              fScore,
              gScore: tentativeGScore,
              parent: currentZoneId,
            };
          }
        }
      }
    }
  }

  // No path found.
  return null;
}

/**
 * Reconstructs the path from start to goal using the parent map.
 */
function reconstructPath(
  parents: Map<ZoneId, ZoneId | null>,
  goalZoneId: ZoneId,
): readonly ZoneId[] {
  const path: ZoneId[] = [];
  let current: ZoneId | null = goalZoneId;

  while (current !== null) {
    path.unshift(current);
    const parent = parents.get(current);
    current = parent ?? null;
  }

  return path;
}
