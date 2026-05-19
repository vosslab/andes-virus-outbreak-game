import {
	APP_TITLE,
	SCHEMATIC_ASSET_PATH,
	SHIP_SCHEMATIC_HEIGHT,
	SHIP_SCHEMATIC_WIDTH,
} from "./constants";
import { DEFAULT_SCENARIO_ID, getScenarioPreset } from "./scenarios";
import { createInitialSimulation, runSimulationTicks } from "./simulation";
import { summarizeSimulation } from "./statistics";
import {
	DEFAULT_SEED,
	buildScenarioFromControls,
	clamp,
	controlsFromScenario,
	createDefaultControlState,
} from "./ui_state";
import {
	configureOverlaySvg,
	createElement,
	createSvgElement,
	createZoneList,
	renderApp,
	setScenarioSelectValue,
} from "./rendering";

import type { AppControlState, AppMode } from "./ui_state";
import type { AppElements, CurvePoint, RenderModel } from "./rendering";
import type {
	ScenarioConfig,
	ScenarioId,
	SimulationState,
} from "./types/simulation";

const TICKS_PER_RUN_STEP = 1;
const RUN_INTERVAL_MS = 420;
const HISTORY_LIMIT = 96;
const SCENARIO_IDS: readonly ScenarioId[] = [
	"normal_cruise",
	"reduced_gathering",
	"fast_isolation",
	"cabin_stay",
	"cleaning_emphasis",
];

type AppState = {
	readonly controls: AppControlState;
	readonly scenario: ScenarioConfig;
	readonly simulation: SimulationState;
	readonly history: readonly CurvePoint[];
	readonly running: boolean;
	readonly timerId: number | undefined;
};

function createSchematicImage(): HTMLImageElement {
	const image = document.createElement("img");
	image.className = "ship-schematic";
	image.src = SCHEMATIC_ASSET_PATH;
	image.alt = "Top-down cruise ship schematic with outbreak simulation zones.";
	image.width = SHIP_SCHEMATIC_WIDTH;
	image.height = SHIP_SCHEMATIC_HEIGHT;
	return image;
}

function createButton(label: string, className: string): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	button.textContent = label;
	return button;
}

function createRangeInput(
	minimum: string,
	maximum: string,
	step: string,
): HTMLInputElement {
	const input = document.createElement("input");
	input.type = "range";
	input.min = minimum;
	input.max = maximum;
	input.step = step;
	return input;
}

function createMetric(labelText: string, valueClassName: string): HTMLElement {
	const item = createElement("div", "metric");
	const label = createElement("span", "metric-label");
	const value = createElement("strong", valueClassName);
	label.textContent = labelText;
	item.append(label, value);
	return item;
}

function getMetricValue(metric: HTMLElement): HTMLElement {
	const value = metric.querySelector("strong");

	if (!(value instanceof HTMLElement)) {
		throw new Error("Metric value element is missing.");
	}

	return value;
}

function createLabeledRange(
	labelText: string,
	input: HTMLInputElement,
	valueClassName: string,
): { readonly field: HTMLElement; readonly value: HTMLElement } {
	const field = createElement("label", "control-field");
	const row = createElement("span", "control-label-row");
	const label = createElement("span", "control-label");
	const value = createElement("span", valueClassName);
	label.textContent = labelText;
	row.append(label, value);
	field.append(row, input);
	return { field, value };
}

function buildShell(root: HTMLElement): AppElements {
	const shipPanel = createElement("section", "ship-panel");
	const mapStack = createElement("div", "ship-map-stack");
	const schematic = createSchematicImage();
	const passengerOverlay = createSvgElement("svg", "passenger-overlay");
	configureOverlaySvg(passengerOverlay);
	mapStack.append(schematic, passengerOverlay);
	shipPanel.appendChild(mapStack);

	const sidePanel = createElement("aside", "control-panel");
	const title = document.createElement("h1");
	const subtitle = createElement("p", "subtitle");
	title.textContent = APP_TITLE;
	subtitle.textContent =
		"Run a classroom scenario and compare assumptions without treating it as medical advice.";

	const modeGroup = createElement("div", "segmented-control");
	const gameModeButton = createButton("Game", "segment-button");
	const scienceModeButton = createButton("Science", "segment-button");
	modeGroup.append(gameModeButton, scienceModeButton);

	const scenarioSelect = document.createElement("select");
	scenarioSelect.className = "scenario-select";
	populateScenarioOptions(scenarioSelect);

	const metrics = createElement("section", "metrics-grid");
	const dayMetric = createMetric("Day", "day-value");
	const tickMetric = createMetric("Tick", "tick-value");
	const totalMetric = createMetric("Passengers", "total-value");
	const activeMetric = createMetric("Active", "active-value");
	const everMetric = createMetric("Ever exposed", "ever-value");
	metrics.append(dayMetric, tickMetric, totalMetric, activeMetric, everMetric);

	const actionRow = createElement("div", "action-row");
	const playPauseButton = createButton("Run", "primary-button");
	const stepButton = createButton("Step", "secondary-button");
	const resetButton = createButton("Reset", "secondary-button");
	actionRow.append(playPauseButton, stepButton, resetButton);

	const fomiteLabel = createElement("label", "toggle-field");
	const fomiteToggle = document.createElement("input");
	const fomiteText = createElement("span", "toggle-label");
	fomiteToggle.type = "checkbox";
	fomiteText.textContent = "What-if surface contact";
	fomiteLabel.append(fomiteToggle, fomiteText);

	const controls = createElement("section", "controls-stack");
	const incubationInput = createRangeInput("4", "40", "1");
	const riskInput = createRangeInput("0.005", "0.08", "0.001");
	const isolationInput = createRangeInput("1", "18", "1");
	const movementInput = createRangeInput("0.15", "0.95", "0.01");
	const cleaningInput = createRangeInput("0", "0.95", "0.01");
	const incubationRange = createLabeledRange(
		"Incubation time",
		incubationInput,
		"incubation-value",
	);
	const riskRange = createLabeledRange(
		"Close-contact risk",
		riskInput,
		"risk-value",
	);
	const isolationRange = createLabeledRange(
		"Isolation speed",
		isolationInput,
		"isolation-value",
	);
	const movementRange = createLabeledRange(
		"Movement and gathering",
		movementInput,
		"movement-value",
	);
	const cleaningRange = createLabeledRange(
		"Cleaning effectiveness",
		cleaningInput,
		"cleaning-value",
	);
	controls.append(
		incubationRange.field,
		riskRange.field,
		isolationRange.field,
		movementRange.field,
		cleaningRange.field,
		fomiteLabel,
	);

	const legendList = createElement("ul", "legend-list");
	const chart = createSvgElement("svg", "curve-chart");
	chart.setAttribute("viewBox", "0 0 320 150");
	chart.setAttribute("role", "img");
	chart.setAttribute("aria-label", "Outbreak curve chart");

	const assumptionList = createElement("ul", "assumption-list");
	const sciencePanel = createElement("section", "science-panel");
	const scienceTitle = document.createElement("h2");
	const scienceBody = createElement("ul", "science-detail-list");
	scienceTitle.textContent = "Scenario assumptions";
	sciencePanel.append(scienceTitle, scienceBody);

	const zoneSummary = createElement("ul", "zone-summary-list");
	const zoneList = createZoneList();

	sidePanel.append(
		title,
		subtitle,
		modeGroup,
		scenarioSelect,
		metrics,
		actionRow,
		controls,
		legendList,
		chart,
		sciencePanel,
		assumptionList,
		zoneSummary,
		zoneList,
	);
	root.replaceChildren(shipPanel, sidePanel);

	const elements = {
		dayValue: getMetricValue(dayMetric),
		tickValue: getMetricValue(tickMetric),
		totalValue: getMetricValue(totalMetric),
		activeValue: getMetricValue(activeMetric),
		everValue: getMetricValue(everMetric),
		scenarioSelect,
		gameModeButton,
		scienceModeButton,
		playPauseButton,
		stepButton,
		resetButton,
		fomiteToggle,
		incubationInput,
		riskInput,
		isolationInput,
		movementInput,
		cleaningInput,
		incubationValue: incubationRange.value,
		riskValue: riskRange.value,
		isolationValue: isolationRange.value,
		movementValue: movementRange.value,
		cleaningValue: cleaningRange.value,
		passengerOverlay,
		legendList,
		chart,
		assumptionList,
		sciencePanel,
		scienceBody,
		zoneSummary,
	};
	return elements;
}

function populateScenarioOptions(select: HTMLSelectElement): void {
	for (const scenarioId of SCENARIO_IDS) {
		const scenario = getScenarioPreset(scenarioId);
		const option = document.createElement("option");
		option.value = scenario.id;
		option.textContent = scenario.name;
		select.appendChild(option);
	}

	select.value = DEFAULT_SCENARIO_ID;
}

function createInitialAppState(): AppState {
	const controls = createDefaultControlState();
	const scenario = buildScenarioFromControls(controls);
	const simulation = createInitialSimulation(scenario, DEFAULT_SEED);
	const history = createHistory(simulation);
	const state = {
		controls,
		scenario,
		simulation,
		history,
		running: false,
		timerId: undefined,
	};
	return state;
}

function createHistory(simulation: SimulationState): readonly CurvePoint[] {
	const summary = summarizeSimulation(simulation);
	const history = [{ tick: simulation.tick, counts: summary.counts }];
	return history;
}

function appendHistory(
	history: readonly CurvePoint[],
	simulation: SimulationState,
): readonly CurvePoint[] {
	const summary = summarizeSimulation(simulation);
	const nextHistory = [
		...history,
		{ tick: simulation.tick, counts: summary.counts },
	];
	return nextHistory.slice(-HISTORY_LIMIT);
}

function makeRenderModel(state: AppState): RenderModel {
	const summary = summarizeSimulation(state.simulation);
	const model = {
		mode: state.controls.mode,
		scenario: state.scenario,
		controls: state.controls,
		summary,
		passengers: state.simulation.passengers,
		history: state.history,
		running: state.running,
	};
	return model;
}

function wireEvents(
	elements: AppElements,
	getState: () => AppState,
	setState: (state: AppState) => void,
): void {
	elements.gameModeButton.addEventListener("click", function handleGameMode() {
		setState(updateMode(getState(), "game"));
	});
	elements.scienceModeButton.addEventListener("click", function handleScienceMode() {
		setState(updateMode(getState(), "science"));
	});
	elements.playPauseButton.addEventListener("click", function handlePlayPause() {
		const state = getState();

		if (state.running) {
			setState(stopRunning(state));
			return;
		}

		setState(startRunning(state, elements, getState, setState));
	});
	elements.stepButton.addEventListener("click", function handleStep() {
		setState(advanceState(stopRunning(getState()), TICKS_PER_RUN_STEP));
	});
	elements.resetButton.addEventListener("click", function handleReset() {
		setState(resetSimulation(stopRunning(getState())));
	});
	elements.scenarioSelect.addEventListener("change", function handleScenario() {
		const scenarioId = parseScenarioId(elements.scenarioSelect.value);
		const scenario = getScenarioPreset(scenarioId);
		const currentMode = getState().controls.mode;
		const fomiteEnabled = getState().controls.fomiteEnabled;
		const controls = controlsFromScenario(currentMode, scenario, fomiteEnabled);
		setState(rebuildFromControls(stopRunning(getState()), controls));
	});
	elements.fomiteToggle.addEventListener("change", function handleFomite() {
		const state = getState();
		const controls = {
			...state.controls,
			fomiteEnabled: elements.fomiteToggle.checked,
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
	elements.incubationInput.addEventListener("input", function handleIncubation() {
		const state = getState();
		const controls = {
			...state.controls,
			incubationTicks: Number(elements.incubationInput.value),
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
	elements.riskInput.addEventListener("input", function handleRisk() {
		const state = getState();
		const controls = {
			...state.controls,
			closeContactRisk: Number(elements.riskInput.value),
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
	elements.isolationInput.addEventListener("input", function handleIsolation() {
		const state = getState();
		const controls = {
			...state.controls,
			isolationSpeedTicks: Number(elements.isolationInput.value),
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
	elements.movementInput.addEventListener("input", function handleMovement() {
		const state = getState();
		const controls = {
			...state.controls,
			movementGatheringLevel: clamp(
				Number(elements.movementInput.value),
				0.15,
				0.95,
			),
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
	elements.cleaningInput.addEventListener("input", function handleCleaning() {
		const state = getState();
		const controls = {
			...state.controls,
			cleaningEffect: clamp(Number(elements.cleaningInput.value), 0, 0.95),
		};
		setState(rebuildFromControls(stopRunning(state), controls));
	});
}

function parseScenarioId(value: string): ScenarioId {
	for (const scenarioId of SCENARIO_IDS) {
		if (scenarioId === value) {
			return scenarioId;
		}
	}

	throw new Error(`Unknown scenario id: ${value}`);
}

function updateMode(state: AppState, mode: AppMode): AppState {
	const controls = { ...state.controls, mode };
	const nextState = { ...state, controls };
	return nextState;
}

function startRunning(
	state: AppState,
	elements: AppElements,
	getState: () => AppState,
	setState: (state: AppState) => void,
): AppState {
	const timerId = window.setInterval(function handleInterval() {
		const nextState = advanceState(getState(), TICKS_PER_RUN_STEP);
		setState(nextState);
	}, RUN_INTERVAL_MS);
	const nextState = { ...state, running: true, timerId };
	renderApp(elements, makeRenderModel(nextState));
	return nextState;
}

function stopRunning(state: AppState): AppState {
	if (state.timerId !== undefined) {
		window.clearInterval(state.timerId);
	}

	const nextState = { ...state, running: false, timerId: undefined };
	return nextState;
}

function advanceState(state: AppState, tickCount: number): AppState {
	const simulation = runSimulationTicks(state.simulation, state.scenario, tickCount);
	const history = appendHistory(state.history, simulation);
	const nextState = { ...state, simulation, history };
	return nextState;
}

function rebuildFromControls(
	state: AppState,
	controls: AppControlState,
): AppState {
	const scenario = buildScenarioFromControls(controls);
	const simulation = createInitialSimulation(scenario, DEFAULT_SEED);
	const history = createHistory(simulation);
	const nextState = { ...state, controls, scenario, simulation, history };
	return nextState;
}

function resetSimulation(state: AppState): AppState {
	const simulation = createInitialSimulation(state.scenario, DEFAULT_SEED);
	const history = createHistory(simulation);
	const nextState = { ...state, simulation, history };
	return nextState;
}

function main(): void {
	const root = document.getElementById("app");

	if (root === null) {
		throw new Error("Missing #app mount element.");
	}

	const elements = buildShell(root);
	let state = createInitialAppState();

	function getState(): AppState {
		return state;
	}

	function setState(nextState: AppState): void {
		state = nextState;
		setScenarioSelectValue(elements.scenarioSelect, state.controls.scenarioId);
		renderApp(elements, makeRenderModel(state));
	}

	wireEvents(elements, getState, setState);
	setState(state);
}

main();
