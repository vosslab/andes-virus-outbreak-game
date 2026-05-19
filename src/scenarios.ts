import type { ScenarioConfig, ScenarioId } from "./types/simulation";

const BASE_FOMITE_ASSUMPTION = {
	enabled: false,
	surfaceExposureChance: 0.018,
	contaminationDecay: 0.34,
	cleaningReduction: 0.78,
};

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
		assumptions: [
			{
				label: "Scenario assumption: shared activities",
				description:
					"Dining, lounge, and pool visits create the main passenger contacts.",
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
		assumptions: [
			{
				label: "Scenario assumption: cabin-first routing",
				description:
					"Most non-isolated passengers return to their assigned cabin area.",
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
} as const satisfies Record<ScenarioId, ScenarioConfig>;

export const DEFAULT_SCENARIO_ID: ScenarioId = "normal_cruise";

export function getScenarioPreset(scenarioId: ScenarioId): ScenarioConfig {
	const scenario = SCENARIO_PRESETS[scenarioId];
	return scenario;
}

export function withFomiteWhatIf(
	scenario: ScenarioConfig,
	enabled: boolean,
): ScenarioConfig {
	const updatedScenario = {
		...scenario,
		fomite: {
			...scenario.fomite,
			enabled,
		},
	};
	return updatedScenario;
}
