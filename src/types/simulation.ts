import type { ZoneId } from "./ship";

export type HealthState =
  "healthy" | "exposed" | "pre_symptomatic" | "symptomatic" | "isolated" | "recovered";

export type AgentRole = "passenger" | "crew" | "officer";

export type Point = {
  readonly x: number;
  readonly y: number;
};

export type AgentParams = {
  readonly speed: number;
  readonly reaction_time: number;
  readonly contact_multiplier: number;
  readonly risk_tolerance: number;
};

export type AgentParamsDistribution = {
  readonly speed: { readonly mean: number; readonly stddev: number };
  readonly reaction_time: { readonly mean: number; readonly stddev: number };
  readonly contact_multiplier: { readonly mean: number; readonly stddev: number };
  readonly risk_tolerance: { readonly mean: number; readonly stddev: number };
};

export type ScenarioId =
  | "normal_cruise"
  | "reduced_gathering"
  | "fast_isolation"
  | "cabin_stay"
  | "cleaning_emphasis"
  | "named_seed"
  | "high_variability"
  | "large_crowd";

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

export type SepirRates = {
  readonly beta_P: number;
  readonly beta_I: number;
  readonly sigma: number;
  readonly rho: number;
  readonly gamma: number;
  readonly omega: number;
  readonly isolation_goal_rate: number;
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
  readonly named_seed?: boolean;
  readonly sepir_rates?: SepirRates;
  readonly agent_params_distribution?: AgentParamsDistribution;
  /** Door IDs to exclude when building the navmesh for this scenario. Stateless: filtered at init, not per tick. */
  readonly closed_doors?: readonly string[];
};

export type Passenger = {
  readonly id: number;
  readonly label: string;
  readonly name: string;
  readonly health: HealthState;
  readonly zoneId: ZoneId;
  readonly cabinZoneId: ZoneId;
  readonly position: Point;
  readonly velocity: Point;
  readonly params: AgentParams;
  readonly role: AgentRole;
  readonly exposedAtTick?: number;
  readonly infectiousAtTick?: number;
  readonly isolatedAtTick?: number;
  readonly recoveredAtTick?: number;
  readonly path: readonly ZoneId[];
  readonly pathIndex: number;
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

export type DerivedEpidemiologyValues = {
  readonly effective_r0: number;
  readonly effective_rt: number;
  readonly approx_herd_threshold: number;
};

export type SimulationSummary = {
  readonly tick: number;
  readonly scenarioId: ScenarioId;
  readonly counts: HealthCounts;
  readonly zoneSummaries: readonly ZoneHealthSummary[];
  readonly activeExposureCount: number;
  readonly everExposedCount: number;
} & ({ readonly derived?: never } | { readonly derived: DerivedEpidemiologyValues });
