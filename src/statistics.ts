import { SHIP_ZONES } from "./ship_layout";

import type {
	HealthCounts,
	HealthState,
	Passenger,
	SimulationState,
	SimulationSummary,
	ZoneContamination,
	ZoneHealthSummary,
} from "./types/simulation";
import type { ZoneId } from "./types/ship";

const HEALTH_STATES: readonly HealthState[] = [
	"healthy",
	"exposed",
	"infectious",
	"isolated",
	"recovered",
];

export function summarizeSimulation(state: SimulationState): SimulationSummary {
	const counts = countHealthStates(state.passengers);
	const zoneSummaries = summarizeZones(state.passengers, state.zoneContamination);
	const activeExposureCount =
		counts.exposed + counts.infectious + counts.isolated;
	const everExposedCount =
		counts.exposed + counts.infectious + counts.isolated + counts.recovered;
	const summary = {
		tick: state.tick,
		scenarioId: state.scenarioId,
		counts,
		zoneSummaries,
		activeExposureCount,
		everExposedCount,
	};
	return summary;
}

export function countHealthStates(
	passengers: readonly Passenger[],
): HealthCounts {
	const counts = createEmptyHealthCounts();

	for (const passenger of passengers) {
		counts[passenger.health] += 1;
	}

	return counts;
}

export function summarizeZones(
	passengers: readonly Passenger[],
	contamination: readonly ZoneContamination[],
): readonly ZoneHealthSummary[] {
	const zoneSummaries = SHIP_ZONES.map(function mapZone(zone) {
		const counts = countHealthStatesInZone(passengers, zone.id);
		const contaminationLevel = getContaminationLevel(contamination, zone.id);
		const summary = {
			zoneId: zone.id,
			counts,
			contaminationLevel,
		};
		return summary;
	});
	return zoneSummaries;
}

function countHealthStatesInZone(
	passengers: readonly Passenger[],
	zoneId: ZoneId,
): HealthCounts {
	const counts = createEmptyHealthCounts();

	for (const passenger of passengers) {
		if (passenger.zoneId === zoneId) {
			counts[passenger.health] += 1;
		}
	}

	return counts;
}

function createEmptyHealthCounts(): HealthCounts {
	const counts = {
		healthy: 0,
		exposed: 0,
		infectious: 0,
		isolated: 0,
		recovered: 0,
	};

	for (const healthState of HEALTH_STATES) {
		counts[healthState] = 0;
	}

	return counts;
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
