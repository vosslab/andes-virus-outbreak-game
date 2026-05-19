import type { ZoneId } from "./ship";

export type HealthState =
	| "healthy"
	| "exposed"
	| "infectious"
	| "isolated"
	| "recovered";

export type ScenarioId =
	| "normal_cruise"
	| "reduced_gathering"
	| "fast_isolation"
	| "cabin_stay"
	| "cleaning_emphasis";

export type ScenarioAssumption = {
	readonly label: string;
	readonly description: string;
};

export type FomiteAssumption = {
	readonly enabled: boolean;
	readonly surfaceExposureChance: number;
	readonly contaminationDecay: number;
	readonly cleaningReduction: number;
};

export type ScenarioConfig = {
	readonly id: ScenarioId;
	readonly name: string;
	readonly description: string;
	readonly passengerCount: number;
	readonly initialInfectiousCount: number;
	readonly ticksPerDay: number;
	readonly incubationTicks: number;
	readonly infectiousTicks: number;
	readonly exposureChanceByContact: number;
	readonly publicGatheringWeight: number;
	readonly movementChance: number;
	readonly isolationAfterInfectiousTicks: number;
	readonly isolationRoutingChance: number;
	readonly cabinStayProbability: number;
	readonly cleaningEffect: number;
	readonly fomite: FomiteAssumption;
	readonly assumptions: readonly ScenarioAssumption[];
};

export type Passenger = {
	readonly id: number;
	readonly label: string;
	readonly health: HealthState;
	readonly zoneId: ZoneId;
	readonly cabinZoneId: ZoneId;
	readonly exposedAtTick?: number;
	readonly infectiousAtTick?: number;
	readonly isolatedAtTick?: number;
	readonly recoveredAtTick?: number;
};

export type ZoneContamination = {
	readonly zoneId: ZoneId;
	readonly level: number;
};

export type SimulationState = {
	readonly tick: number;
	readonly seed: number;
	readonly scenarioId: ScenarioId;
	readonly passengers: readonly Passenger[];
	readonly zoneContamination: readonly ZoneContamination[];
	readonly events: readonly SimulationEvent[];
};

export type SimulationEvent =
	| {
			readonly type: "passenger_moved";
			readonly tick: number;
			readonly passengerId: number;
			readonly fromZoneId: ZoneId;
			readonly toZoneId: ZoneId;
	  }
	| {
			readonly type: "passenger_exposed";
			readonly tick: number;
			readonly passengerId: number;
			readonly zoneId: ZoneId;
			readonly mechanism: "near_infectious_passenger" | "what_if_fomite";
	  }
	| {
			readonly type: "became_infectious";
			readonly tick: number;
			readonly passengerId: number;
	  }
	| {
			readonly type: "routed_to_isolation";
			readonly tick: number;
			readonly passengerId: number;
			readonly fromZoneId: ZoneId;
	  }
	| {
			readonly type: "recovered";
			readonly tick: number;
			readonly passengerId: number;
	  };

export type HealthCounts = Record<HealthState, number>;

export type ZoneHealthSummary = {
	readonly zoneId: ZoneId;
	readonly counts: HealthCounts;
	readonly contaminationLevel: number;
};

export type SimulationSummary = {
	readonly tick: number;
	readonly scenarioId: ScenarioId;
	readonly counts: HealthCounts;
	readonly zoneSummaries: readonly ZoneHealthSummary[];
	readonly activeExposureCount: number;
	readonly everExposedCount: number;
};
