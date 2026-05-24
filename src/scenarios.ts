import type {
	ScenarioConfig,
	ScenarioId,
	SepirRates,
	AgentParamsDistribution,
} from "./types/simulation";

/**
 * Parameter migration (D2 / M6 / SEPIR):
 *   exposureChanceByContact      -> derived from beta_P/beta_I + spatial proximity (M6b)
 *   incubationTicks              -> 1 / sigma (in days; tick = 1/240 day)
 *   infectiousTicks              -> 1 / gamma (in days)
 *   isolationAfterInfectiousTicks -> 1 / isolation_goal_rate (when on)
 *   contaminationDecay           -> retained in scenario for fomite term (separate)
 * Effective R0 = (beta_P / rho) + (beta_I / gamma) -- labeled "effective" in UI.
 */

const BASE_FOMITE_ASSUMPTION = {
	enabled: false,
	surfaceExposureChance: 0.018,
	contaminationDecay: 0.34,
	cleaningReduction: 0.78,
};

const DEFAULT_SEPIR_RATES = {
	beta_P: 0.3,
	beta_I: 0.6,
	sigma: 1 / 3,
	rho: 0.5,
	gamma: 1 / 7,
	omega: 0,
	isolation_goal_rate: 0,
} as const satisfies SepirRates;

const ISOLATION_SEPIR_RATES = {
	...DEFAULT_SEPIR_RATES,
	isolation_goal_rate: 0.2,
} as const satisfies SepirRates;

// speed unit: px/tick. After the M10.5 motion-scaling fix, velocity integration
// is 1:1 per tick (no DT_DAYS multiplier). mean=2.0 px/tick crosses a 50-px cabin
// in ~25 ticks (nominal); stddev=0.3 allows ~10% variance across agents.
const DEFAULT_AGENT_PARAMS_DISTRIBUTION = {
	speed: { mean: 2.0, stddev: 0.3 }, // px/tick
	reaction_time: { mean: 2.0, stddev: 0.5 },
	contact_multiplier: { mean: 1.0, stddev: 0.2 },
	risk_tolerance: { mean: 0.5, stddev: 0.15 },
} as const satisfies AgentParamsDistribution;

const HIGH_VARIABILITY_AGENT_PARAMS_DISTRIBUTION = {
	speed: { mean: 2.0, stddev: 0.6 }, // px/tick
	reaction_time: { mean: 2.0, stddev: 1.0 },
	contact_multiplier: { mean: 1.0, stddev: 0.4 },
	risk_tolerance: { mean: 0.5, stddev: 0.3 },
} as const satisfies AgentParamsDistribution;

export const SCENARIO_PRESETS = {
	normal_cruise: {
		id: "normal_cruise",
		name: "Normal Cruise",
		description: "Passengers follow a typical cruise day with shared public spaces.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.028,
		publicGatheringWeight: 1,
		movementChance: 0.7,
		isolationAfterInfectiousTicks: 8,
		isolationRoutingChance: 0.55,
		cabinStayProbability: 0.12,
		cleaningEffect: 0.2,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: shared activities",
				description: "Dining, lounge, and pool visits create the main passenger contacts.",
			},
			{
				label: "Scenario assumption: routine isolation",
				description:
					"Infectious passengers may be routed to isolation after symptoms are noticed.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	reduced_gathering: {
		id: "reduced_gathering",
		name: "Reduced Gathering",
		description: "Public activities are smaller and less frequent.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.022,
		publicGatheringWeight: 0.55,
		movementChance: 0.48,
		isolationAfterInfectiousTicks: 8,
		isolationRoutingChance: 0.58,
		cabinStayProbability: 0.25,
		cleaningEffect: 0.25,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: smaller groups",
				description:
					"Passengers still move around, but fewer people collect in public spaces.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	fast_isolation: {
		id: "fast_isolation",
		name: "Fast Isolation",
		description: "Infectious passengers are found and moved to isolation faster.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.026,
		publicGatheringWeight: 0.9,
		movementChance: 0.62,
		isolationAfterInfectiousTicks: 3,
		isolationRoutingChance: 0.86,
		cabinStayProbability: 0.18,
		cleaningEffect: 0.25,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: ISOLATION_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: quicker symptom response",
				description:
					"Once infectious, passengers are more likely to be moved to isolation.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	cabin_stay: {
		id: "cabin_stay",
		name: "Cabin Stay",
		description: "Passengers spend much more time in their cabins.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.018,
		publicGatheringWeight: 0.35,
		movementChance: 0.32,
		isolationAfterInfectiousTicks: 6,
		isolationRoutingChance: 0.68,
		cabinStayProbability: 0.68,
		cleaningEffect: 0.25,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: cabin-first routing",
				description: "Most non-isolated passengers return to their assigned cabin area.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	cleaning_emphasis: {
		id: "cleaning_emphasis",
		name: "Cleaning Emphasis",
		description: "Public spaces receive stronger routine cleaning.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.024,
		publicGatheringWeight: 0.8,
		movementChance: 0.6,
		isolationAfterInfectiousTicks: 7,
		isolationRoutingChance: 0.62,
		cabinStayProbability: 0.22,
		cleaningEffect: 0.86,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: stronger cleaning",
				description:
					"Cleaning lowers the what-if surface route and slightly lowers public risk.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	named_seed: {
		id: "named_seed",
		name: "Named Seed Agents",
		description: "16 named agents with predefined positions and health states.",
		passengerCount: 16,
		initialInfectiousCount: 0,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.028,
		publicGatheringWeight: 1,
		movementChance: 0.7,
		isolationAfterInfectiousTicks: 8,
		isolationRoutingChance: 0.55,
		cabinStayProbability: 0.12,
		cleaningEffect: 0.2,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		named_seed: true,
		assumptions: [
			{
				label: "Scenario assumption: named seed agents",
				description:
					"16 predefined agents with names, roles, and initial health states from ship.yaml.",
			},
			{
				label: "Scenario assumption: continuous space",
				description: "Agents are positioned in continuous space rather than random zones.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	high_variability: {
		id: "high_variability",
		name: "High Variability",
		description:
			"Normal cruise scenario with doubled agent parameter variability to demonstrate heterogeneity.",
		passengerCount: 84,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.028,
		publicGatheringWeight: 1,
		movementChance: 0.7,
		isolationAfterInfectiousTicks: 8,
		isolationRoutingChance: 0.55,
		cabinStayProbability: 0.12,
		cleaningEffect: 0.2,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: HIGH_VARIABILITY_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: high agent heterogeneity",
				description:
					"Agents have doubled variance in speed, reaction time, and contact behavior.",
			},
			{
				label: "Scenario assumption: shared activities",
				description: "Dining, lounge, and pool visits create the main passenger contacts.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
	large_crowd: {
		id: "large_crowd",
		name: "Large Crowd",
		description: "Stress test at N=1000 passengers; exercises perf budget at scale.",
		passengerCount: 1000,
		initialInfectiousCount: 1,
		ticksPerDay: 8,
		incubationTicks: 16,
		infectiousTicks: 28,
		exposureChanceByContact: 0.028,
		publicGatheringWeight: 1,
		movementChance: 0.7,
		isolationAfterInfectiousTicks: 8,
		isolationRoutingChance: 0.55,
		cabinStayProbability: 0.12,
		cleaningEffect: 0.2,
		fomite: BASE_FOMITE_ASSUMPTION,
		sepir_rates: DEFAULT_SEPIR_RATES,
		agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION,
		assumptions: [
			{
				label: "Scenario assumption: large crowd",
				description:
					"1000 passengers; primarily for M8 perf budget verification and stress testing.",
			},
			{
				label: "Scenario assumption: shared activities",
				description: "Dining, lounge, and pool visits create the main passenger contacts.",
			},
			{
				label: "Scenario assumption: fomites off by default",
				description:
					"Surface spread is not included unless the what-if fomite toggle is enabled.",
			},
		],
	},
} as const satisfies Record<ScenarioId, ScenarioConfig>;

export const DEFAULT_SCENARIO_ID: ScenarioId = "normal_cruise";

export function getScenarioPreset(scenarioId: ScenarioId): ScenarioConfig {
	const scenario = SCENARIO_PRESETS[scenarioId];
	return scenario;
}

export function withFomiteWhatIf(scenario: ScenarioConfig, enabled: boolean): ScenarioConfig {
	const updatedScenario = {
		...scenario,
		fomite: {
			...scenario.fomite,
			enabled,
		},
	};
	return updatedScenario;
}
