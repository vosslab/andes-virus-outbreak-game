import { chance, createRandomState, normalRandom, randomInt } from "./random";
import { SHIP_ZONES, getZoneById } from "./ship_layout";
import { CABIN_ZONE_IDS } from "./ship_roles";
import { getNamedAgentSeed } from "./named_agent_seed";
import { planRoomPath, nextWaypoint, initNavmesh } from "./navigation";
import { DT_DAYS, CONTACT_RADIUS, PERCEPTION_RADIUS, BETA_PAIR_SCALE } from "./sim_constants";
import {
	separation,
	alignment,
	cohesion,
	targetSeek,
	obstacleAvoid,
	doorwayBias,
} from "./steering";
import { buildAgentIndex, queryNeighborsWithinDistance } from "./perception";
import { stepWithCollision, pointInPolygon } from "./collision";
import { SHIP_LAYOUT } from "./ship_layout.generated.js";

import type { RandomState } from "./random";
import type {
	AgentParams,
	AgentParamsDistribution,
	HealthState,
	Passenger,
	Point,
	ScenarioConfig,
	SimulationEvent,
	SimulationState,
	ZoneContamination,
} from "./types/simulation";
import type { ShipZone, ZoneId } from "./types/ship";

/**
 * Convert a rate (per day) to a per-tick probability using the standard formula:
 * p = 1 - exp(-rate * dt)
 * This is used throughout the SEPIR transition logic (M6b).
 */
export function rateToProb(rate: number, dt: number): number {
	return 1 - Math.exp(-rate * dt);
}

const PUBLIC_ZONE_KINDS = new Set(["public", "operations"]);
const ISOLATION_ZONE_ID: ZoneId = "isolation";

// Default agent parameter distribution (matches current hardcoded values)
const DEFAULT_AGENT_PARAMS_DISTRIBUTION: AgentParamsDistribution = {
	speed: { mean: 2.0, stddev: 0.3 },
	reaction_time: { mean: 2.0, stddev: 0.5 },
	contact_multiplier: { mean: 1.0, stddev: 0.2 },
	risk_tolerance: { mean: 0.5, stddev: 0.15 },
};

// ============================================
// Deadlock guard constants
// ============================================

/** Stall limit (ticks): if a passenger doesn't move for this many ticks, apply random perturbation. */
const STALL_LIMIT = 20;

/** Stall detection threshold (pixels): movement less than this counts as stalled. */
const STALL_THRESHOLD = 0.5;

/** Perturbation magnitude (pixels): random walk magnitude applied to unstuck a passenger. */
const STALL_PERTURBATION_MAGNITUDE = 1.0;

export function createInitialSimulation(scenario: ScenarioConfig, seed: number): SimulationState {
	// Initialize navmesh with scenario's closed doors (X2 contract: stateless, pre-filter at init).
	// This rebuilds the room graph once, filtering out any doors listed in closed_doors.
	initNavmesh(scenario.closed_doors ?? []);

	const passengers = createInitialPassengers(scenario);
	const zoneContamination = createEmptyZoneContamination();
	const randomState = createRandomState(seed);
	const state = {
		tick: 0,
		seed: randomState.seed,
		scenarioId: scenario.id,
		passengers,
		zoneContamination,
		events: [],
	};
	return state;
}

export function advanceSimulationTick(
	state: SimulationState,
	scenario: ScenarioConfig,
): SimulationState {
	const nextTick = state.tick + 1;
	const randomState = createRandomState(state.seed);
	const movementResult = movePassengers(state.passengers, scenario, nextTick, randomState);
	const progressionResult = progressPassengerHealth(
		movementResult.passengers,
		scenario,
		nextTick,
		movementResult.randomState,
	);
	const contamination = updateZoneContamination(
		state.zoneContamination,
		progressionResult.passengers,
		scenario,
	);
	const exposureResult = exposePassengers(
		progressionResult.passengers,
		contamination,
		scenario,
		nextTick,
		progressionResult.randomState,
	);
	const events = [
		...movementResult.events,
		...progressionResult.events,
		...exposureResult.events,
	];
	const nextState = {
		tick: nextTick,
		seed: exposureResult.randomState.seed,
		scenarioId: scenario.id,
		passengers: exposureResult.passengers,
		zoneContamination: contamination,
		events,
	};
	return nextState;
}

export function runSimulationTicks(
	state: SimulationState,
	scenario: ScenarioConfig,
	tickCount: number,
): SimulationState {
	let currentState = state;

	for (let index = 0; index < tickCount; index += 1) {
		currentState = advanceSimulationTick(currentState, scenario);
	}

	return currentState;
}

type PassengerStep = {
	readonly passengers: readonly Passenger[];
	readonly events: readonly SimulationEvent[];
	readonly randomState: RandomState;
};

function createInitialPassengers(scenario: ScenarioConfig): readonly Passenger[] {
	if (scenario.named_seed) {
		return createNamedSeedPassengers(scenario);
	}

	return createRandomPassengers(scenario);
}

function createNamedSeedPassengers(scenario: ScenarioConfig): readonly Passenger[] {
	const namedSeeds = getNamedAgentSeed();
	let randomState = createRandomState(0);
	const passengers: Passenger[] = [];
	const distribution = scenario.agent_params_distribution ?? DEFAULT_AGENT_PARAMS_DISTRIBUTION;

	for (const namedSeed of namedSeeds) {
		const zoneId = findZoneContainingPoint(namedSeed.pixel_coords);
		const paramsResult = generateAgentParamsWithState(randomState, distribution);
		randomState = paramsResult.randomState;
		const params = paramsResult.params;

		const mappedState = namedSeed.state;

		const passenger: Passenger = {
			id: parseInt(namedSeed.id.slice(1), 10),
			label: namedSeed.name,
			name: namedSeed.name,
			health: mappedState,
			zoneId,
			cabinZoneId: zoneId,
			position: namedSeed.pixel_coords,
			velocity: { x: 0, y: 0 },
			params,
			role: namedSeed.role,
			...(mappedState === "pre_symptomatic" ? { infectiousAtTick: 0 } : {}),
			...(mappedState === "exposed" ? { exposedAtTick: 0 } : {}),
			...(mappedState === "isolated" ? { isolatedAtTick: 0 } : {}),
			...(mappedState === "recovered" ? { recoveredAtTick: 0 } : {}),
			path: [],
			pathIndex: 0,
		};
		passengers.push(passenger);
	}

	return passengers;
}

function createRandomPassengers(scenario: ScenarioConfig): readonly Passenger[] {
	const passengers: Passenger[] = [];
	let randomState = createRandomState(0);
	const distribution = scenario.agent_params_distribution ?? DEFAULT_AGENT_PARAMS_DISTRIBUTION;

	for (let id = 0; id < scenario.passengerCount; id += 1) {
		const cabinZoneId = chooseCabinZoneId(id);
		const health = getInitialHealth(id, scenario.initialInfectiousCount);
		const paramsResult = generateAgentParamsWithState(randomState, distribution);
		randomState = paramsResult.randomState;
		const params = paramsResult.params;

		// Initialize position within the cabin zone using deterministic placement.
		const cabinZone = getZoneById(cabinZoneId);
		const posX = cabinZone.bounds.x + cabinZone.bounds.width / 2;
		const posY = cabinZone.bounds.y + cabinZone.bounds.height / 2;

		const passenger: Passenger = {
			id,
			label: `Passenger ${id + 1}`,
			name: `Passenger ${id + 1}`,
			health,
			zoneId: cabinZoneId,
			cabinZoneId,
			position: { x: posX, y: posY },
			velocity: { x: 0, y: 0 },
			params,
			role: "passenger",
			...(health === "pre_symptomatic" ? { infectiousAtTick: 0 } : {}),
			path: [],
			pathIndex: 0,
		};
		passengers.push(passenger);
	}

	return passengers;
}

function getInitialHealth(passengerId: number, initialInfectiousCount: number): HealthState {
	if (passengerId < initialInfectiousCount) {
		return "pre_symptomatic";
	}

	return "healthy";
}

function chooseCabinZoneId(passengerId: number): ZoneId {
	const index = passengerId % CABIN_ZONE_IDS.length;
	const zoneId = CABIN_ZONE_IDS[index];

	if (zoneId === undefined) {
		throw new Error("Cabin zone list is empty");
	}

	return zoneId;
}

function findZoneContainingPoint(point: Point): ZoneId {
	for (const zone of SHIP_ZONES) {
		if (
			point.x >= zone.bounds.x &&
			point.x < zone.bounds.x + zone.bounds.width &&
			point.y >= zone.bounds.y &&
			point.y < zone.bounds.y + zone.bounds.height
		) {
			return zone.id;
		}
	}

	// Fallback to first cabin if no zone contains point
	const defaultZone = CABIN_ZONE_IDS[0];
	if (defaultZone === undefined) {
		throw new Error("No cabin zones available");
	}
	return defaultZone;
}

function generateAgentParamsWithState(
	randomState: RandomState,
	distribution: AgentParamsDistribution,
): {
	readonly params: AgentParams;
	readonly randomState: RandomState;
} {
	// Generate agent parameters from seeded distributions
	const speedResult = normalRandom(
		randomState,
		distribution.speed.mean,
		distribution.speed.stddev,
	);
	const reactionResult = normalRandom(
		speedResult.state,
		distribution.reaction_time.mean,
		distribution.reaction_time.stddev,
	);
	const contactResult = normalRandom(
		reactionResult.state,
		distribution.contact_multiplier.mean,
		distribution.contact_multiplier.stddev,
	);
	const toleranceResult = normalRandom(
		contactResult.state,
		distribution.risk_tolerance.mean,
		distribution.risk_tolerance.stddev,
	);

	// Clamp values to reasonable ranges
	const clampValue = (value: number, min: number, max: number): number => {
		return Math.max(min, Math.min(max, value));
	};

	const params: AgentParams = {
		speed: clampValue(speedResult.normal, 0.1, 2.0),
		reaction_time: clampValue(Math.round(reactionResult.normal), 1, 5),
		contact_multiplier: clampValue(contactResult.normal, 0.1, 2.0),
		risk_tolerance: clampValue(toleranceResult.normal, 0, 1),
	};

	return {
		params,
		randomState: toleranceResult.state,
	};
}

//============================================
// Continuous-space helper functions
//============================================

/**
 * Converts a rectangular bounds to a CCW polygon (4 vertices).
 */
function boundsToPolygon(bounds: {
	x: number;
	y: number;
	width: number;
	height: number;
}): readonly Point[] {
	return [
		{ x: bounds.x, y: bounds.y },
		{ x: bounds.x + bounds.width, y: bounds.y },
		{ x: bounds.x + bounds.width, y: bounds.y + bounds.height },
		{ x: bounds.x, y: bounds.y + bounds.height },
	];
}

/**
 * Gets the polygon and door segments for a zone.
 */
function getZonePolygonAndDoors(zoneId: ZoneId): {
	readonly polygon: readonly Point[];
	readonly doorSegments: readonly (readonly [Point, Point])[];
} {
	const zone = getZoneById(zoneId);
	const polygon = boundsToPolygon(zone.bounds);

	// Filter doors that connect to/from this zone.
	const doorSegments: (readonly [Point, Point])[] = [];
	for (const door of SHIP_LAYOUT.doors) {
		if (door.roomIds[0] === zoneId || door.roomIds[1] === zoneId) {
			doorSegments.push(door.segment);
		}
	}

	return { polygon, doorSegments };
}

/**
 * Gets the goal position (center of a zone).
 */
function getZoneCenter(zoneId: ZoneId): Point {
	const zone = getZoneById(zoneId);
	return zone.center;
}

/**
 * Finds the door segment that connects currentZoneId to nextZoneId (if any).
 * Used for doorway bias steering.
 */
function getDoorSegmentToZone(
	currentZoneId: ZoneId,
	nextZoneId: ZoneId,
): readonly [Point, Point] | null {
	for (const door of SHIP_LAYOUT.doors) {
		const [roomA, roomB] = door.roomIds;
		if (
			(roomA === currentZoneId && roomB === nextZoneId) ||
			(roomA === nextZoneId && roomB === currentZoneId)
		) {
			return door.segment;
		}
	}
	return null;
}

/**
 * Detects if a position has crossed into an adjacent zone.
 * Returns the new zone ID if a zone transition occurred, or the current zone ID otherwise.
 */
function detectZoneTransition(
	position: Point,
	currentZoneId: ZoneId,
	path: readonly ZoneId[],
	pathIndex: number,
): ZoneId {
	// If at the end of the path, check if we've reached the goal zone.
	if (pathIndex === path.length - 1) {
		const goalZoneId = path[pathIndex];
		if (goalZoneId === undefined) {
			return currentZoneId;
		}
		const { polygon } = getZonePolygonAndDoors(goalZoneId);
		if (pointInPolygon(position, polygon)) {
			return goalZoneId;
		}
		return currentZoneId;
	}

	// Check if position is inside the next zone in the path.
	const nextZoneId = path[pathIndex + 1];
	if (nextZoneId === undefined) {
		return currentZoneId;
	}

	const { polygon } = getZonePolygonAndDoors(nextZoneId);
	if (pointInPolygon(position, polygon)) {
		return nextZoneId;
	}

	return currentZoneId;
}

function createEmptyZoneContamination(): readonly ZoneContamination[] {
	const contamination = SHIP_ZONES.map(function mapZone(zone: ShipZone) {
		const zoneContamination = {
			zoneId: zone.id,
			level: 0,
		};
		return zoneContamination;
	});
	return contamination;
}

function movePassengers(
	passengers: readonly Passenger[],
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): PassengerStep {
	// Pre-tick: build spatial hash from current positions for neighbor queries.
	const spatialHash = buildAgentIndex(passengers, 56); // SPATIAL_HASH_CELL_SIZE = 56

	const movedPassengers: Passenger[] = [];
	const events: SimulationEvent[] = [];
	let currentRandomState = randomState;

	// Track stall state per passenger (position delta from last tick).
	const stallState = new Map<number, number>();

	for (const passenger of passengers) {
		const movement = movePassengerContinuous(
			passenger,
			passengers,
			spatialHash,
			scenario,
			tick,
			currentRandomState,
		);
		currentRandomState = movement.randomState;
		movedPassengers.push(movement.passenger);

		// Track stall count.
		const positionDelta = Math.hypot(
			movement.passenger.position.x - passenger.position.x,
			movement.passenger.position.y - passenger.position.y,
		);
		const prevStallCount = stallState.get(passenger.id) ?? 0;
		stallState.set(passenger.id, positionDelta < STALL_THRESHOLD ? prevStallCount + 1 : 0);

		if (movement.event !== undefined) {
			events.push(movement.event);
		}
	}

	// Deadlock guard: if any passenger has stalled for too long, apply random perturbation.
	const perturbedPassengers: Passenger[] = [];
	for (const passenger of movedPassengers) {
		const stallCount = stallState.get(passenger.id) ?? 0;
		if (stallCount >= STALL_LIMIT) {
			// Apply random perturbation to unstick.
			const randResult = normalRandom(currentRandomState, 0, 1);
			currentRandomState = randResult.state;
			const angle = randResult.normal * Math.PI * 2;
			const perturbX = Math.cos(angle) * STALL_PERTURBATION_MAGNITUDE;
			const perturbY = Math.sin(angle) * STALL_PERTURBATION_MAGNITUDE;

			const perturbed: Passenger = {
				...passenger,
				position: {
					x: passenger.position.x + perturbX,
					y: passenger.position.y + perturbY,
				},
				velocity: { x: 0, y: 0 }, // Reset velocity after perturbation.
			};
			perturbedPassengers.push(perturbed);
			stallState.set(passenger.id, 0);
		} else {
			perturbedPassengers.push(passenger);
		}
	}

	const result = {
		passengers: perturbedPassengers,
		events,
		randomState: currentRandomState,
	};
	return result;
}

//============================================
// Continuous-space movement (M5c)
//============================================

/**
 * Moves a passenger using continuous-space steering.
 * Blends six steering forces:
 *   - Separation (repulsion from nearby agents)
 *   - Alignment (average velocity of neighbors)
 *   - Cohesion (attraction to neighbor center)
 *   - Target seek (toward next waypoint)
 *   - Obstacle avoidance (repulsion from walls)
 *   - Doorway bias (toward the door to next zone, if applicable)
 *
 * Steering weights (hardcoded for v1):
 *   - sep: 2.0
 *   - align: 1.0
 *   - cohere: 0.5
 *   - seek: 1.0
 *   - avoid: 3.0
 *   - doorBias: 1.5
 */
function movePassengerContinuous(
	passenger: Passenger,
	allPassengers: readonly Passenger[],
	spatialHash: ReturnType<typeof buildAgentIndex>,
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly event?: SimulationEvent;
	readonly randomState: RandomState;
} {
	let currentRandomState = randomState;

	// Isolation handling: teleport to isolation zone (backward-compatible).
	if (passenger.health === "isolated") {
		return {
			passenger: { ...passenger, zoneId: ISOLATION_ZONE_ID },
			randomState: currentRandomState,
		};
	}

	// Movement decision: check cabin stay and movement chance.
	const stayInCabin = chance(currentRandomState, scenario.cabinStayProbability);
	currentRandomState = stayInCabin.state;

	if (stayInCabin.happened) {
		// Stay in cabin: small drift toward cabin zone center, but remain in current zone.
		return makeMovementResult(passenger, passenger.cabinZoneId, tick, currentRandomState);
	}

	const shouldMove = chance(currentRandomState, scenario.movementChance);
	currentRandomState = shouldMove.state;

	if (!shouldMove.happened) {
		// Not moving this tick: slight velocity decay.
		const decayedVelocity = {
			x: passenger.velocity.x * 0.9,
			y: passenger.velocity.y * 0.9,
		};
		return {
			passenger: { ...passenger, velocity: decayedVelocity },
			randomState: currentRandomState,
		};
	}

	// Check if passenger has an active path.
	const hasActivePath = passenger.path.length > 0 && passenger.pathIndex < passenger.path.length;

	if (!hasActivePath) {
		// No active path: plan a new destination and path.
		const pathPlanResult = planPathForPassenger(passenger, scenario, currentRandomState);
		currentRandomState = pathPlanResult.randomState;

		if (pathPlanResult.passenger.path.length === 0) {
			// No path found: stay in place with small velocity.
			return {
				passenger: pathPlanResult.passenger,
				randomState: currentRandomState,
			};
		}

		// Recursive call with new path.
		return movePassengerContinuous(
			pathPlanResult.passenger,
			allPassengers,
			spatialHash,
			scenario,
			tick,
			currentRandomState,
		);
	}

	// Compute next waypoint along the path.
	const goalZoneId = passenger.path[passenger.path.length - 1];
	if (goalZoneId === undefined) {
		throw new Error("Path should not be empty");
	}

	const goalZoneCenter = getZoneCenter(goalZoneId);
	let currentWaypoint: Point;
	try {
		currentWaypoint = nextWaypoint(
			passenger.zoneId,
			passenger.path,
			passenger.pathIndex,
			goalZoneCenter,
		);
	} catch {
		// Replan if waypoint computation fails.
		const pathPlanResult = planPathForPassenger(passenger, scenario, currentRandomState);
		currentRandomState = pathPlanResult.randomState;
		return movePassengerContinuous(
			pathPlanResult.passenger,
			allPassengers,
			spatialHash,
			scenario,
			tick,
			currentRandomState,
		);
	}

	// Query neighbors within perception radius.
	const neighbors = queryNeighborsWithinDistance(
		allPassengers,
		spatialHash,
		passenger,
		PERCEPTION_RADIUS,
	);

	// Extract positions and velocities of neighbors within perception radius.
	const neighborPositions: Point[] = [];
	const neighborVelocities: Point[] = [];
	for (const neighbor of neighbors) {
		const otherPassenger = allPassengers.find((p) => p.id === neighbor.id);
		if (otherPassenger) {
			neighborPositions.push(otherPassenger.position);
			// Only align with neighbors within alignment distance (half perception).
			if (neighbor.distance < PERCEPTION_RADIUS / 2) {
				neighborVelocities.push(otherPassenger.velocity);
			}
		}
	}

	// Compute steering forces.
	const desiredDistance = CONTACT_RADIUS / 2; // Half a contact radius for personal space.
	const sep = separation(passenger.position, neighborPositions, desiredDistance);
	const align = alignment(passenger.velocity, neighborVelocities);
	const cohere = cohesion(passenger.position, neighborPositions);
	const seek = targetSeek(passenger.position, currentWaypoint, passenger.params.speed);

	// Obstacle avoidance: get walls of current zone.
	const { polygon: currentZonePolygon, doorSegments: currentZoneDoors } = getZonePolygonAndDoors(
		passenger.zoneId,
	);

	// Convert polygon to wall segments (edges).
	const wallSegments: [Point, Point][] = [];
	for (let i = 0; i < currentZonePolygon.length; i++) {
		const p0 = currentZonePolygon[i];
		const p1 = currentZonePolygon[(i + 1) % currentZonePolygon.length];
		if (p0 && p1) {
			wallSegments.push([p0, p1]);
		}
	}

	const avoid = obstacleAvoid(passenger.position, wallSegments, 14); // lookahead = 14 pixels

	// Doorway bias: target the door to the next zone (if on a multi-zone path).
	let doorSegment: readonly [Point, Point] | null = null;
	if (passenger.pathIndex < passenger.path.length - 1) {
		const nextZoneId = passenger.path[passenger.pathIndex + 1];
		if (nextZoneId) {
			doorSegment = getDoorSegmentToZone(passenger.zoneId, nextZoneId);
		}
	}
	const doorBias = doorwayBias(passenger.position, doorSegment, 0.5);

	// Blend forces with hardcoded weights (v1).
	const sepForce = {
		x: Number(sep.x) * 2.0,
		y: Number(sep.y) * 2.0,
	};
	const alignForce = {
		x: Number(align.x) * 1.0,
		y: Number(align.y) * 1.0,
	};
	const cohereForce = {
		x: Number(cohere.x) * 0.5,
		y: Number(cohere.y) * 0.5,
	};
	const seekForce = {
		x: Number(seek.x) * 1.0,
		y: Number(seek.y) * 1.0,
	};
	const avoidForce = {
		x: Number(avoid.x) * 3.0,
		y: Number(avoid.y) * 3.0,
	};
	const doorForce = {
		x: Number(doorBias.x) * 1.5,
		y: Number(doorBias.y) * 1.5,
	};

	const totalForce = {
		x: sepForce.x + alignForce.x + cohereForce.x + seekForce.x + avoidForce.x + doorForce.x,
		y: sepForce.y + alignForce.y + cohereForce.y + seekForce.y + avoidForce.y + doorForce.y,
	};

	// Update velocity: apply forces scaled by DT_DAYS.
	let newVelocity = {
		x: passenger.velocity.x + totalForce.x * DT_DAYS,
		y: passenger.velocity.y + totalForce.y * DT_DAYS,
	};

	// Cap velocity magnitude at max speed.
	const velMag = Math.hypot(newVelocity.x, newVelocity.y);
	if (velMag > passenger.params.speed) {
		const scale = passenger.params.speed / velMag;
		newVelocity = {
			x: newVelocity.x * scale,
			y: newVelocity.y * scale,
		};
	}

	// Compute candidate position: one tick step.
	const candidatePos = {
		x: passenger.position.x + newVelocity.x,
		y: passenger.position.y + newVelocity.y,
	};

	// Apply collision detection: clamp to zone and allow door passage.
	const finalPos = stepWithCollision(
		passenger.position,
		candidatePos,
		currentZonePolygon,
		currentZoneDoors,
	);

	// Detect zone transition (if position crossed a door).
	const newZoneId = detectZoneTransition(
		finalPos,
		passenger.zoneId,
		passenger.path,
		passenger.pathIndex,
	);

	// Advance path index if zone changed.
	let newPathIndex = passenger.pathIndex;
	let movedEvent: SimulationEvent | undefined;

	if (newZoneId !== passenger.zoneId) {
		newPathIndex = passenger.pathIndex + 1;
		movedEvent = {
			type: "passenger_moved",
			tick,
			passengerId: passenger.id,
			fromZoneId: passenger.zoneId,
			toZoneId: newZoneId,
		};
	}

	const movedPassenger: Passenger = {
		...passenger,
		position: finalPos,
		velocity: newVelocity,
		zoneId: newZoneId,
		pathIndex: newPathIndex,
	};

	const resultObj: {
		passenger: Passenger;
		event?: SimulationEvent;
		randomState: RandomState;
	} = {
		passenger: movedPassenger,
		randomState: currentRandomState,
	};
	if (movedEvent !== undefined) {
		resultObj.event = movedEvent;
	}
	return resultObj;
}

function makeMovementResult(
	passenger: Passenger,
	destinationZoneId: ZoneId,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly event?: SimulationEvent;
	readonly randomState: RandomState;
} {
	if (passenger.zoneId === destinationZoneId) {
		return { passenger, randomState };
	}

	const movedPassenger: Passenger = { ...passenger, zoneId: destinationZoneId };
	const event: SimulationEvent = {
		type: "passenger_moved",
		tick,
		passengerId: passenger.id,
		fromZoneId: passenger.zoneId,
		toZoneId: destinationZoneId,
	};
	const result = {
		passenger: movedPassenger,
		event,
		randomState,
	};
	return result;
}

function chooseDestination(
	currentZoneId: ZoneId,
	scenario: ScenarioConfig,
	randomState: RandomState,
): { readonly zoneId: ZoneId; readonly randomState: RandomState } {
	const currentZone = getZoneById(currentZoneId);
	const linkedZoneIds = currentZone.links;
	const weightedZoneIds = buildWeightedDestinationList(linkedZoneIds, scenario);

	if (weightedZoneIds.length === 0) {
		return { zoneId: currentZoneId, randomState };
	}

	const indexResult = randomInt(randomState, 0, weightedZoneIds.length - 1);
	const zoneId = weightedZoneIds[indexResult.integer];

	if (zoneId === undefined) {
		throw new Error("Destination index was outside weighted zone list");
	}

	return { zoneId, randomState: indexResult.state };
}

function buildWeightedDestinationList(
	zoneIds: readonly ZoneId[],
	scenario: ScenarioConfig,
): readonly ZoneId[] {
	const weightedZoneIds: ZoneId[] = [];

	for (const zoneId of zoneIds) {
		weightedZoneIds.push(zoneId);
		const zone = getZoneById(zoneId);

		if (PUBLIC_ZONE_KINDS.has(zone.kind)) {
			const repeatCount = Math.max(0, Math.round(scenario.publicGatheringWeight * 3));

			for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
				weightedZoneIds.push(zoneId);
			}
		}
	}

	return weightedZoneIds;
}

function progressPassengerHealth(
	passengers: readonly Passenger[],
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): PassengerStep {
	const progressedPassengers: Passenger[] = [];
	const events: SimulationEvent[] = [];
	let currentRandomState = randomState;

	for (const passenger of passengers) {
		const progression = progressOnePassenger(passenger, scenario, tick, currentRandomState);
		currentRandomState = progression.randomState;
		progressedPassengers.push(progression.passenger);
		events.push(...progression.events);
	}

	const result = {
		passengers: progressedPassengers,
		events,
		randomState: currentRandomState,
	};
	return result;
}

function progressOnePassenger(
	passenger: Passenger,
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly events: readonly SimulationEvent[];
	readonly randomState: RandomState;
} {
	// Use SEPIR rate-driven transitions if sepir_rates is defined; otherwise fall back to legacy tick-counter logic.
	if (scenario.sepir_rates) {
		return progressOnePassengerSepir(passenger, scenario, tick, randomState);
	}

	return progressOnePassengerLegacy(passenger, scenario, tick, randomState);
}

/**
 * SEPIR rate-driven health transitions (M6b).
 * Each transition is governed by a rate and DT_DAYS.
 * Order of evaluation:
 *   1. exposed -> pre_symptomatic (sigma)
 *   2. pre_symptomatic -> symptomatic (rho)
 *   3. symptomatic -> recovered (gamma)
 *   4. symptomatic -> isolated (isolation_goal_rate, independently; can co-occur with recovery)
 *   5. recovered -> healthy (omega)
 *
 * Each transition uses one LCG draw. State mutations are deterministic given the random state.
 */
function progressOnePassengerSepir(
	passenger: Passenger,
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly events: readonly SimulationEvent[];
	readonly randomState: RandomState;
} {
	const rates = scenario.sepir_rates;
	if (!rates) {
		throw new Error("sepir_rates must be defined in progressOnePassengerSepir");
	}

	let currentPassenger = passenger;
	let currentRandomState = randomState;
	const events: SimulationEvent[] = [];

	// 1. exposed -> pre_symptomatic (sigma)
	if (currentPassenger.health === "exposed") {
		const sigma_prob = rateToProb(rates.sigma, DT_DAYS);
		const transitionCheck = chance(currentRandomState, sigma_prob);
		currentRandomState = transitionCheck.state;

		if (transitionCheck.happened) {
			currentPassenger = {
				...currentPassenger,
				health: "pre_symptomatic",
				infectiousAtTick: tick,
			};
			events.push({
				type: "became_infectious",
				tick,
				passengerId: passenger.id,
			});
		}
	}

	// 2. pre_symptomatic -> symptomatic (rho)
	if (currentPassenger.health === "pre_symptomatic") {
		const rho_prob = rateToProb(rates.rho, DT_DAYS);
		const transitionCheck = chance(currentRandomState, rho_prob);
		currentRandomState = transitionCheck.state;

		if (transitionCheck.happened) {
			currentPassenger = {
				...currentPassenger,
				health: "symptomatic",
			};
		}
	}

	// 3. symptomatic -> recovered (gamma)
	if (currentPassenger.health === "symptomatic") {
		const gamma_prob = rateToProb(rates.gamma, DT_DAYS);
		const transitionCheck = chance(currentRandomState, gamma_prob);
		currentRandomState = transitionCheck.state;

		if (transitionCheck.happened) {
			currentPassenger = {
				...currentPassenger,
				health: "recovered",
				recoveredAtTick: tick,
			};
			events.push({
				type: "recovered",
				tick,
				passengerId: passenger.id,
			});
		}
	}

	// 4. symptomatic -> isolated (isolation_goal_rate, independently)
	// This transition can co-occur with recovery in the same tick.
	if (currentPassenger.health === "symptomatic") {
		const isolation_prob = rateToProb(rates.isolation_goal_rate, DT_DAYS);
		const transitionCheck = chance(currentRandomState, isolation_prob);
		currentRandomState = transitionCheck.state;

		if (transitionCheck.happened) {
			currentPassenger = {
				...currentPassenger,
				health: "isolated",
				zoneId: ISOLATION_ZONE_ID,
				isolatedAtTick: tick,
			};
			events.push({
				type: "routed_to_isolation",
				tick,
				passengerId: passenger.id,
				fromZoneId: passenger.zoneId,
			});
		}
	}

	// 5. recovered -> healthy (omega; loses immunity)
	if (currentPassenger.health === "recovered") {
		const omega_prob = rateToProb(rates.omega, DT_DAYS);
		const transitionCheck = chance(currentRandomState, omega_prob);
		currentRandomState = transitionCheck.state;

		if (transitionCheck.happened) {
			// Create new passenger object without recoveredAtTick.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { recoveredAtTick, ...passengerWithoutRecovery } = currentPassenger;
			currentPassenger = {
				...passengerWithoutRecovery,
				health: "healthy",
			};
		}
	}

	return { passenger: currentPassenger, events, randomState: currentRandomState };
}

/**
 * Legacy tick-counter-based health transitions.
 * Used when sepir_rates is undefined (backward compatibility for M6a).
 */
function progressOnePassengerLegacy(
	passenger: Passenger,
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly events: readonly SimulationEvent[];
	readonly randomState: RandomState;
} {
	if (
		passenger.health === "exposed" &&
		passenger.exposedAtTick !== undefined &&
		tick - passenger.exposedAtTick >= scenario.incubationTicks
	) {
		const becameInfectious: Passenger = {
			...passenger,
			health: "pre_symptomatic",
			infectiousAtTick: tick,
		};
		const event: SimulationEvent = {
			type: "became_infectious",
			tick,
			passengerId: passenger.id,
		};
		return { passenger: becameInfectious, events: [event], randomState };
	}

	if (
		(passenger.health === "pre_symptomatic" ||
			passenger.health === "symptomatic" ||
			passenger.health === "isolated") &&
		passenger.infectiousAtTick !== undefined &&
		tick - passenger.infectiousAtTick >= scenario.infectiousTicks
	) {
		const recovered: Passenger = {
			...passenger,
			health: "recovered",
			recoveredAtTick: tick,
		};
		const event: SimulationEvent = {
			type: "recovered",
			tick,
			passengerId: passenger.id,
		};
		return { passenger: recovered, events: [event], randomState };
	}

	if (
		(passenger.health === "pre_symptomatic" || passenger.health === "symptomatic") &&
		passenger.infectiousAtTick !== undefined &&
		tick - passenger.infectiousAtTick >= scenario.isolationAfterInfectiousTicks
	) {
		const isolationCheck = chance(randomState, scenario.isolationRoutingChance);

		if (isolationCheck.happened) {
			const isolated: Passenger = {
				...passenger,
				health: "isolated",
				zoneId: ISOLATION_ZONE_ID,
				isolatedAtTick: tick,
			};
			const event: SimulationEvent = {
				type: "routed_to_isolation",
				tick,
				passengerId: passenger.id,
				fromZoneId: passenger.zoneId,
			};
			return {
				passenger: isolated,
				events: [event],
				randomState: isolationCheck.state,
			};
		}

		return {
			passenger,
			events: [],
			randomState: isolationCheck.state,
		};
	}

	return { passenger, events: [], randomState };
}

function updateZoneContamination(
	previousContamination: readonly ZoneContamination[],
	passengers: readonly Passenger[],
	scenario: ScenarioConfig,
): readonly ZoneContamination[] {
	const contamination: ZoneContamination[] = [];

	for (const zone of SHIP_ZONES) {
		const previousLevel = getContaminationLevel(previousContamination, zone.id);
		const infectiousCount = countInfectiousPassengersInZone(passengers, zone.id);
		const addedLevel = scenario.fomite.enabled ? infectiousCount * 0.16 : 0;
		const cleanedLevel = previousLevel * (1 - scenario.fomite.contaminationDecay);
		const nextLevel = Math.min(1, cleanedLevel + addedLevel);
		contamination.push({ zoneId: zone.id, level: nextLevel });
	}

	return contamination;
}

function exposePassengers(
	passengers: readonly Passenger[],
	contamination: readonly ZoneContamination[],
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): PassengerStep {
	const updatedPassengers: Passenger[] = [];
	const events: SimulationEvent[] = [];
	let currentRandomState = randomState;

	// Build spatial hash once per tick (M5 continuous-space infrastructure).
	const spatialHash = buildAgentIndex(passengers, 56); // SPATIAL_HASH_CELL_SIZE = 56

	for (const passenger of passengers) {
		if (passenger.health !== "healthy") {
			updatedPassengers.push(passenger);
			continue;
		}

		const exposure = scenario.sepir_rates
			? computeExposureSepir(
					passenger,
					passengers,
					spatialHash,
					contamination,
					scenario,
					currentRandomState,
				)
			: computeExposureLegacy(
					passenger,
					passengers,
					contamination,
					scenario,
					currentRandomState,
				);
		currentRandomState = exposure.randomState;

		if (exposure.exposed) {
			const exposedPassenger: Passenger = {
				...passenger,
				health: "exposed",
				exposedAtTick: tick,
			};
			const event: SimulationEvent = {
				type: "passenger_exposed",
				tick,
				passengerId: passenger.id,
				zoneId: passenger.zoneId,
				mechanism: exposure.mechanism,
			};
			updatedPassengers.push(exposedPassenger);
			events.push(event);
		} else {
			updatedPassengers.push(passenger);
		}
	}

	const result = {
		passengers: updatedPassengers,
		events,
		randomState: currentRandomState,
	};
	return result;
}

/**
 * SEPIR rate-driven exposure (M6b).
 * For each healthy passenger:
 *   - Build list of nearby infectious passengers (pre_symptomatic or symptomatic) within CONTACT_RADIUS.
 *   - For each infectious neighbor, compute per-pair beta:
 *     beta_effective = (neighbor.health === 'pre_symptomatic') ? beta_P : beta_I
 *     beta_effective *= passenger.params.contact_multiplier * neighbor.params.contact_multiplier
 *   - Compute per-neighbor infection probability: 1 - exp(-beta_effective * DT_DAYS)
 *   - Combine across neighbors: 1 - product of (1 - p_i)
 *   - Add zone-fomite contribution (if enabled).
 *   - Combine with fomite: 1 - product formula.
 *   - Single LCG draw against combined probability.
 */
function computeExposureSepir(
	passenger: Passenger,
	passengers: readonly Passenger[],
	spatialHash: ReturnType<typeof buildAgentIndex>,
	contamination: readonly ZoneContamination[],
	scenario: ScenarioConfig,
	randomState: RandomState,
): {
	readonly exposed: boolean;
	readonly mechanism: "near_infectious_passenger" | "what_if_fomite";
	readonly randomState: RandomState;
} {
	const rates = scenario.sepir_rates;
	if (!rates) {
		throw new Error("sepir_rates must be defined in computeExposureSepir");
	}

	// Query infectious neighbors within CONTACT_RADIUS.
	const infectiousNeighbors = queryNeighborsWithinDistance(
		passengers,
		spatialHash,
		passenger,
		CONTACT_RADIUS,
	).filter((neighbor) => {
		const neighborPassenger = passengers.find((p) => p.id === neighbor.id);
		return (
			neighborPassenger &&
			(neighborPassenger.health === "pre_symptomatic" ||
				neighborPassenger.health === "symptomatic")
		);
	});

	// Compute contact-based infection probability (combination across neighbors).
	let contactExposureProb = 0;
	if (infectiousNeighbors.length > 0) {
		let survivalProb = 1; // 1 - (combined prob)

		for (const neighborRecord of infectiousNeighbors) {
			const neighbor = passengers.find((p) => p.id === neighborRecord.id);
			if (!neighbor) continue;

			const beta = neighbor.health === "pre_symptomatic" ? rates.beta_P : rates.beta_I;
			const effective_beta =
				beta *
				BETA_PAIR_SCALE *
				passenger.params.contact_multiplier *
				neighbor.params.contact_multiplier;
			const per_neighbor_prob = rateToProb(effective_beta, DT_DAYS);

			survivalProb *= 1 - per_neighbor_prob;
		}

		contactExposureProb = 1 - survivalProb;
	}

	// Compute fomite-based infection probability (if enabled).
	let fomiteExposureProb = 0;
	if (scenario.fomite.enabled) {
		const contaminationLevel = getContaminationLevel(contamination, passenger.zoneId);
		const fomite_beta = contaminationLevel * 0.016; // Rescaled fomite rate per unit contamination
		fomiteExposureProb = rateToProb(fomite_beta, DT_DAYS);
	}

	// Combine contact and fomite probabilities: 1 - (1 - p_contact) * (1 - p_fomite)
	const combinedProb = 1 - (1 - contactExposureProb) * (1 - fomiteExposureProb);
	const combinedCheck = chance(randomState, combinedProb);

	// Determine mechanism: contact if neighbors present, else fomite.
	const mechanism =
		infectiousNeighbors.length > 0 ? "near_infectious_passenger" : "what_if_fomite";

	return {
		exposed: combinedCheck.happened,
		mechanism,
		randomState: combinedCheck.state,
	};
}

/**
 * Legacy zone-based exposure (M6a and earlier).
 * Used when sepir_rates is undefined.
 */
function computeExposureLegacy(
	passenger: Passenger,
	passengers: readonly Passenger[],
	contamination: readonly ZoneContamination[],
	scenario: ScenarioConfig,
	randomState: RandomState,
): {
	readonly exposed: boolean;
	readonly mechanism: "near_infectious_passenger" | "what_if_fomite";
	readonly randomState: RandomState;
} {
	const infectiousCount = countInfectiousPassengersInZone(passengers, passenger.zoneId);
	const directProbability = computeDirectExposureProbability(
		passenger.zoneId,
		infectiousCount,
		scenario,
	);
	const directCheck = chance(randomState, directProbability);

	if (directCheck.happened) {
		return {
			exposed: true,
			mechanism: "near_infectious_passenger",
			randomState: directCheck.state,
		};
	}

	const fomiteProbability = computeFomiteExposureProbability(
		passenger.zoneId,
		contamination,
		scenario,
	);
	const fomiteCheck = chance(directCheck.state, fomiteProbability);

	return {
		exposed: fomiteCheck.happened,
		mechanism: "what_if_fomite",
		randomState: fomiteCheck.state,
	};
}

function computeDirectExposureProbability(
	zoneId: ZoneId,
	infectiousCount: number,
	scenario: ScenarioConfig,
): number {
	if (infectiousCount === 0) {
		return 0;
	}

	const zone = getZoneById(zoneId);
	const zoneMultiplier = getZoneExposureMultiplier(zone);
	const cleaningReduction = 1 - scenario.cleaningEffect * 0.16;
	const probability =
		infectiousCount *
		scenario.exposureChanceByContact *
		zoneMultiplier *
		scenario.publicGatheringWeight *
		cleaningReduction;
	return probability;
}

function computeFomiteExposureProbability(
	zoneId: ZoneId,
	contamination: readonly ZoneContamination[],
	scenario: ScenarioConfig,
): number {
	if (!scenario.fomite.enabled) {
		return 0;
	}

	const contaminationLevel = getContaminationLevel(contamination, zoneId);
	const cleaningMultiplier = 1 - scenario.cleaningEffect * scenario.fomite.cleaningReduction;
	const probability =
		contaminationLevel *
		scenario.fomite.surfaceExposureChance *
		Math.max(0, cleaningMultiplier);
	return probability;
}

function getZoneExposureMultiplier(zone: ShipZone): number {
	if (zone.kind === "public") {
		return 1.25;
	}

	if (zone.kind === "corridor") {
		return 0.75;
	}

	if (zone.kind === "medical") {
		return 0.35;
	}

	if (zone.kind === "operations") {
		return 0.55;
	}

	if (zone.kind === "crew") {
		return 0.45;
	}

	return 0.5;
}

function countInfectiousPassengersInZone(passengers: readonly Passenger[], zoneId: ZoneId): number {
	let count = 0;

	for (const passenger of passengers) {
		if (
			(passenger.health === "pre_symptomatic" || passenger.health === "symptomatic") &&
			passenger.zoneId === zoneId
		) {
			count += 1;
		}
	}

	return count;
}

function getContaminationLevel(
	contamination: readonly ZoneContamination[],
	zoneId: ZoneId,
): number {
	for (const zoneContamination of contamination) {
		if (zoneContamination.zoneId === zoneId) {
			return zoneContamination.level;
		}
	}

	throw new Error(`Missing contamination state for zone: ${zoneId}`);
}

//============================================
// Path planning for passengers
//============================================

/**
 * Plans a new destination and path for a passenger when they have reached
 * their goal or have no active path. Uses the weighted destination logic
 * to pick a new destination, then plans a room-to-room path.
 *
 * If path planning fails (destination unreachable), retries up to 3 times
 * with new random destinations. If all attempts fail, returns passenger
 * with empty path (stays in current zone).
 *
 * Returns updated passenger with new path and pathIndex set to 0.
 */
function planPathForPassenger(
	passenger: Passenger,
	scenario: ScenarioConfig,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly randomState: RandomState;
} {
	const MAX_RETRIES = 3;
	let currentRandomState = randomState;
	let destinationZoneId: ZoneId | undefined;
	let plannedPath: readonly ZoneId[] | null = null;

	// Try up to MAX_RETRIES times to find a reachable destination
	for (let retryIndex = 0; retryIndex < MAX_RETRIES; retryIndex += 1) {
		const destination = chooseDestination(passenger.zoneId, scenario, currentRandomState);
		currentRandomState = destination.randomState;
		destinationZoneId = destination.zoneId;

		// Attempt to plan path to this destination
		plannedPath = planRoomPath(passenger.zoneId, destinationZoneId);

		// If path is reachable, use it
		if (plannedPath !== null) {
			break;
		}
	}

	// If no reachable destination found after retries, stay in place with empty path
	if (plannedPath === null || destinationZoneId === undefined) {
		const updatedPassenger: Passenger = {
			...passenger,
			path: [],
			pathIndex: 0,
		};
		return { passenger: updatedPassenger, randomState: currentRandomState };
	}

	// Update passenger with new path and reset index to 0 (will advance to 1 next tick if multi-zone path)
	const updatedPassenger: Passenger = {
		...passenger,
		path: plannedPath,
		pathIndex: 0,
	};

	return { passenger: updatedPassenger, randomState: currentRandomState };
}
