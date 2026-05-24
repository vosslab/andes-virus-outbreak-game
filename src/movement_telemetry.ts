/**
 * Test-only movement telemetry collector.
 *
 * Tracks per-agent motion statistics: total displacement, first doorway crossing
 * tick, and room transition count. Consumed by tests only; NOT wired to the live
 * stats panel or src/statistics.ts.
 *
 * Usage: import createTelemetry, record events during a simulation loop,
 * then query aggregate stats for assertions.
 *
 * No imports from simulation internals -- pure counters to avoid circular deps.
 */

//============================================

export type MovementTelemetry = {
	/** Record one tick of movement for an agent. */
	recordTick: (passengerId: number, displacement: number, zoneId: string, pathIndex: number) => void;
	/** Record that an agent crossed into a new doorway at a given tick. */
	recordDoorwayCrossing: (passengerId: number, tick: number) => void;
	/** Total displacement (px) accumulated for an agent. */
	getDisplacement: (passengerId: number) => number;
	/** Tick of first doorway crossing, or null if never crossed. */
	getFirstDoorwayTick: (passengerId: number) => number | null;
	/** Number of room transitions recorded for an agent. */
	getRoomTransitions: (passengerId: number) => number;
	/** Mean displacement across all tracked agents. */
	getMeanDisplacement: () => number;
};

//============================================

/**
 * Create a fresh telemetry collector for the given set of passenger IDs.
 *
 * Args:
 *   passengerIds: list of passenger IDs to track. IDs outside this set are ignored.
 *
 * Returns:
 *   A MovementTelemetry object with per-agent counters reset to zero.
 */
export function createTelemetry(passengerIds: readonly number[]): MovementTelemetry {
	// Per-agent counters, keyed by passenger id.
	const displacement = new Map<number, number>();
	const firstDoorwayTick = new Map<number, number>();
	const roomTransitions = new Map<number, number>();
	// Track previous zoneId per agent to detect transitions.
	const lastZoneId = new Map<number, string>();
	// Track previous pathIndex per agent to detect doorway crossings.
	const lastPathIndex = new Map<number, number>();

	// Initialise all counters to zero.
	for (const id of passengerIds) {
		displacement.set(id, 0);
		roomTransitions.set(id, 0);
	}

	//============================================

	function recordTick(
		passengerId: number,
		disp: number,
		zoneId: string,
		pathIndex: number,
	): void {
		// Ignore unknown agents.
		if (!displacement.has(passengerId)) {
			return;
		}

		// Accumulate displacement. Cap at 32-bit int max to guard memory at N=1000.
		const prev = displacement.get(passengerId) ?? 0;
		displacement.set(passengerId, Math.min(prev + disp, 2147483647));

		// Detect room transition by comparing zone.
		const prevZone = lastZoneId.get(passengerId);
		if (prevZone !== undefined && prevZone !== zoneId) {
			const prevTransitions = roomTransitions.get(passengerId) ?? 0;
			roomTransitions.set(passengerId, prevTransitions + 1);
		}
		lastZoneId.set(passengerId, zoneId);

		// Detect pathIndex advance (proxy for approaching a doorway).
		lastPathIndex.set(passengerId, pathIndex);
	}

	//============================================

	function recordDoorwayCrossing(passengerId: number, tick: number): void {
		// Only record the FIRST crossing.
		if (!firstDoorwayTick.has(passengerId)) {
			firstDoorwayTick.set(passengerId, tick);
		}
	}

	//============================================

	function getDisplacement(passengerId: number): number {
		return displacement.get(passengerId) ?? 0;
	}

	//============================================

	function getFirstDoorwayTick(passengerId: number): number | null {
		const tick = firstDoorwayTick.get(passengerId);
		return tick !== undefined ? tick : null;
	}

	//============================================

	function getRoomTransitions(passengerId: number): number {
		return roomTransitions.get(passengerId) ?? 0;
	}

	//============================================

	function getMeanDisplacement(): number {
		if (displacement.size === 0) {
			return 0;
		}
		let total = 0;
		for (const d of displacement.values()) {
			total += d;
		}
		return total / displacement.size;
	}

	//============================================

	return {
		recordTick,
		recordDoorwayCrossing,
		getDisplacement,
		getFirstDoorwayTick,
		getRoomTransitions,
		getMeanDisplacement,
	};
}
