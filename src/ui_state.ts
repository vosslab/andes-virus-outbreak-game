import { DEFAULT_SCENARIO_ID, getScenarioPreset } from "./scenarios";

import type { ScenarioConfig, ScenarioId } from "./types/simulation";

export type AppMode = "game" | "science";

export type AppControlState = {
	readonly mode: AppMode;
	readonly scenarioId: ScenarioId;
	readonly incubationTicks: number;
	readonly closeContactRisk: number;
	readonly isolationSpeedTicks: number;
	readonly movementGatheringLevel: number;
	readonly cleaningEffect: number;
	readonly fomiteEnabled: boolean;
};

export const DEFAULT_SEED = 20260518;

export function createDefaultControlState(): AppControlState {
	const scenario = getScenarioPreset(DEFAULT_SCENARIO_ID);
	const state = controlsFromScenario("game", scenario, false);
	return state;
}

export function controlsFromScenario(
	mode: AppMode,
	scenario: ScenarioConfig,
	fomiteEnabled: boolean,
): AppControlState {
	const averageMovement = (scenario.movementChance + scenario.publicGatheringWeight) / 2;
	const state = {
		mode,
		scenarioId: scenario.id,
		incubationTicks: scenario.incubationTicks,
		closeContactRisk: scenario.exposureChanceByContact,
		isolationSpeedTicks: scenario.isolationAfterInfectiousTicks,
		movementGatheringLevel: averageMovement,
		cleaningEffect: scenario.cleaningEffect,
		fomiteEnabled,
	};
	return state;
}

export function buildScenarioFromControls(controls: AppControlState): ScenarioConfig {
	const baseScenario = getScenarioPreset(controls.scenarioId);
	const movementChance = clamp(controls.movementGatheringLevel, 0.12, 0.95);
	const publicGatheringWeight = clamp(controls.movementGatheringLevel * 1.18, 0.2, 1.45);
	const scenario = {
		...baseScenario,
		incubationTicks: controls.incubationTicks,
		exposureChanceByContact: controls.closeContactRisk,
		isolationAfterInfectiousTicks: controls.isolationSpeedTicks,
		movementChance,
		publicGatheringWeight,
		cleaningEffect: controls.cleaningEffect,
		fomite: {
			...baseScenario.fomite,
			enabled: controls.fomiteEnabled,
		},
	};
	return scenario;
}

export function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
