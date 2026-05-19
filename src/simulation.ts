import { chance, createRandomState, randomInt } from "./random";
import { SHIP_ZONES, getZoneById } from "./ship_layout";

import type { RandomState } from "./random";
import type {
	HealthState,
	Passenger,
	ScenarioConfig,
	SimulationEvent,
	SimulationState,
	ZoneContamination,
} from "./types/simulation";
import type { ShipZone, ZoneId } from "./types/ship";

const CABIN_ZONE_IDS: readonly ZoneId[] = ["cabins_port", "cabins_starboard"];
const PUBLIC_ZONE_KINDS = new Set(["public", "operations"]);
const ISOLATION_ZONE_ID: ZoneId = "isolation";

export function createInitialSimulation(
	scenario: ScenarioConfig,
	seed: number,
): SimulationState {
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
	const movementResult = movePassengers(
		state.passengers,
		scenario,
		nextTick,
		randomState,
	);
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
	const passengers: Passenger[] = [];

	for (let id = 0; id < scenario.passengerCount; id += 1) {
		const cabinZoneId = chooseCabinZoneId(id);
		const health = getInitialHealth(id, scenario.initialInfectiousCount);
		const passenger: Passenger = {
			id,
			label: `Passenger ${id + 1}`,
			health,
			zoneId: cabinZoneId,
			cabinZoneId,
			...(health === "infectious" ? { infectiousAtTick: 0 } : {}),
		};
		passengers.push(passenger);
	}

	return passengers;
}

function getInitialHealth(
	passengerId: number,
	initialInfectiousCount: number,
): HealthState {
	if (passengerId < initialInfectiousCount) {
		return "infectious";
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
	const movedPassengers: Passenger[] = [];
	const events: SimulationEvent[] = [];
	let currentRandomState = randomState;

	for (const passenger of passengers) {
		const movement = movePassenger(passenger, scenario, tick, currentRandomState);
		currentRandomState = movement.randomState;
		movedPassengers.push(movement.passenger);

		if (movement.event !== undefined) {
			events.push(movement.event);
		}
	}

	const result = {
		passengers: movedPassengers,
		events,
		randomState: currentRandomState,
	};
	return result;
}

function movePassenger(
	passenger: Passenger,
	scenario: ScenarioConfig,
	tick: number,
	randomState: RandomState,
): {
	readonly passenger: Passenger;
	readonly event?: SimulationEvent;
	readonly randomState: RandomState;
} {
	if (passenger.health === "isolated") {
		return {
			passenger: { ...passenger, zoneId: ISOLATION_ZONE_ID },
			randomState,
		};
	}

	const stayInCabin = chance(randomState, scenario.cabinStayProbability);
	let currentRandomState = stayInCabin.state;

	if (stayInCabin.happened) {
		return makeMovementResult(
			passenger,
			passenger.cabinZoneId,
			tick,
			currentRandomState,
		);
	}

	const shouldMove = chance(currentRandomState, scenario.movementChance);
	currentRandomState = shouldMove.state;

	if (!shouldMove.happened) {
		return { passenger, randomState: currentRandomState };
	}

	const destination = chooseDestination(passenger.zoneId, scenario, currentRandomState);
	currentRandomState = destination.randomState;
	const result = makeMovementResult(
		passenger,
		destination.zoneId,
		tick,
		currentRandomState,
	);
	return result;
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
		const progression = progressOnePassenger(
			passenger,
			scenario,
			tick,
			currentRandomState,
		);
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
	if (
		passenger.health === "exposed" &&
		passenger.exposedAtTick !== undefined &&
		tick - passenger.exposedAtTick >= scenario.incubationTicks
	) {
		const becameInfectious: Passenger = {
			...passenger,
			health: "infectious",
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
		(passenger.health === "infectious" || passenger.health === "isolated") &&
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
		passenger.health === "infectious" &&
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

	for (const passenger of passengers) {
		if (passenger.health !== "healthy") {
			updatedPassengers.push(passenger);
			continue;
		}

		const exposure = computeExposure(
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

function computeExposure(
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
	const cleaningMultiplier =
		1 - scenario.cleaningEffect * scenario.fomite.cleaningReduction;
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

function countInfectiousPassengersInZone(
	passengers: readonly Passenger[],
	zoneId: ZoneId,
): number {
	let count = 0;

	for (const passenger of passengers) {
		if (passenger.health === "infectious" && passenger.zoneId === zoneId) {
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
