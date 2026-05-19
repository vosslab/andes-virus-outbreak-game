import { EDUCATION_DISCLAIMER, EDUCATION_PANELS } from "./educational_content";
import { SHIP_LAYOUT, SHIP_ZONES, getZoneById } from "./ship_layout";

import type { AppControlState, AppMode } from "./ui_state";
import type {
	HealthCounts,
	HealthState,
	Passenger,
	ScenarioConfig,
	ScenarioId,
	SimulationSummary,
} from "./types/simulation";
import type { ShipZone } from "./types/ship";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type CurvePoint = {
	readonly tick: number;
	readonly counts: HealthCounts;
};

export type RenderModel = {
	readonly mode: AppMode;
	readonly scenario: ScenarioConfig;
	readonly controls: AppControlState;
	readonly summary: SimulationSummary;
	readonly passengers: readonly Passenger[];
	readonly history: readonly CurvePoint[];
	readonly running: boolean;
};

export type AppElements = {
	readonly dayValue: HTMLElement;
	readonly tickValue: HTMLElement;
	readonly totalValue: HTMLElement;
	readonly activeValue: HTMLElement;
	readonly everValue: HTMLElement;
	readonly scenarioSelect: HTMLSelectElement;
	readonly gameModeButton: HTMLButtonElement;
	readonly scienceModeButton: HTMLButtonElement;
	readonly playPauseButton: HTMLButtonElement;
	readonly stepButton: HTMLButtonElement;
	readonly resetButton: HTMLButtonElement;
	readonly fomiteToggle: HTMLInputElement;
	readonly incubationInput: HTMLInputElement;
	readonly riskInput: HTMLInputElement;
	readonly isolationInput: HTMLInputElement;
	readonly movementInput: HTMLInputElement;
	readonly cleaningInput: HTMLInputElement;
	readonly incubationValue: HTMLElement;
	readonly riskValue: HTMLElement;
	readonly isolationValue: HTMLElement;
	readonly movementValue: HTMLElement;
	readonly cleaningValue: HTMLElement;
	readonly passengerOverlay: SVGSVGElement;
	readonly legendList: HTMLElement;
	readonly chart: SVGSVGElement;
	readonly assumptionList: HTMLElement;
	readonly sciencePanel: HTMLElement;
	readonly scienceBody: HTMLElement;
	readonly zoneSummary: HTMLElement;
};

export function createElement<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	className: string,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tagName);
	element.className = className;
	return element;
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
	tagName: K,
	className: string,
): SVGElementTagNameMap[K] {
	const element = document.createElementNS(SVG_NAMESPACE, tagName);
	element.setAttribute("class", className);
	return element;
}

export function formatPercent(value: number): string {
	const percent = Math.round(value * 100);
	return `${percent}%`;
}

export function formatRisk(value: number): string {
	const percent = (value * 100).toFixed(1);
	return `${percent}%`;
}

export function setModeButtons(
	elements: AppElements,
	mode: AppMode,
): void {
	elements.gameModeButton.setAttribute("aria-pressed", String(mode === "game"));
	elements.scienceModeButton.setAttribute(
		"aria-pressed",
		String(mode === "science"),
	);
}

export function renderApp(elements: AppElements, model: RenderModel): void {
	const day = model.summary.tick / model.scenario.ticksPerDay;
	elements.dayValue.textContent = day.toFixed(1);
	elements.tickValue.textContent = String(model.summary.tick);
	elements.totalValue.textContent = String(model.passengers.length);
	elements.activeValue.textContent = String(model.summary.activeExposureCount);
	elements.everValue.textContent = String(model.summary.everExposedCount);
	elements.playPauseButton.textContent = model.running ? "Pause" : "Run";
	elements.fomiteToggle.checked = model.controls.fomiteEnabled;
	elements.incubationInput.value = String(model.controls.incubationTicks);
	elements.riskInput.value = String(model.controls.closeContactRisk);
	elements.isolationInput.value = String(model.controls.isolationSpeedTicks);
	elements.movementInput.value = String(model.controls.movementGatheringLevel);
	elements.cleaningInput.value = String(model.controls.cleaningEffect);
	elements.incubationValue.textContent = `${model.controls.incubationTicks} ticks`;
	elements.riskValue.textContent = formatRisk(model.controls.closeContactRisk);
	elements.isolationValue.textContent =
		`${model.controls.isolationSpeedTicks} ticks`;
	elements.movementValue.textContent = formatPercent(
		model.controls.movementGatheringLevel,
	);
	elements.cleaningValue.textContent = formatPercent(model.controls.cleaningEffect);

	setModeButtons(elements, model.mode);
	renderPassengerOverlay(elements.passengerOverlay, model.passengers);
	renderLegend(elements.legendList, model.summary.counts);
	renderCurveChart(elements.chart, model.history, model.passengers.length);
	renderAssumptions(elements.assumptionList, model.scenario);
	renderSciencePanel(elements.sciencePanel, elements.scienceBody, model);
	renderZoneSummary(elements.zoneSummary, model.summary);
}

function renderPassengerOverlay(
	overlay: SVGSVGElement,
	passengers: readonly Passenger[],
): void {
	overlay.replaceChildren();

	for (const passenger of passengers) {
		const point = getPassengerPoint(passenger);
		const circle = createSvgElement("circle", "passenger-dot");
		circle.setAttribute("cx", point.x.toFixed(1));
		circle.setAttribute("cy", point.y.toFixed(1));
		circle.setAttribute("r", getPassengerRadius(passenger.health));
		circle.setAttribute("data-health", passenger.health);
		circle.setAttribute("aria-label", `${passenger.label}: ${passenger.health}`);
		overlay.appendChild(circle);
	}
}

function getPassengerPoint(
	passenger: Passenger,
): { readonly x: number; readonly y: number } {
	const zone = getZoneById(passenger.zoneId);
	const columns = Math.max(2, Math.floor(zone.bounds.width / 18));
	const rows = Math.max(2, Math.floor(zone.bounds.height / 18));
	const column = passenger.id % columns;
	const row = Math.floor(passenger.id / columns) % rows;
	const xStep = zone.bounds.width / (columns + 1);
	const yStep = zone.bounds.height / (rows + 1);
	const point = {
		x: zone.bounds.x + xStep * (column + 1),
		y: zone.bounds.y + yStep * (row + 1),
	};
	return point;
}

function getPassengerRadius(health: HealthState): string {
	if (health === "infectious" || health === "isolated") {
		return "6.2";
	}

	return "5.2";
}

function renderLegend(legendList: HTMLElement, counts: HealthCounts): void {
	legendList.replaceChildren();

	const healthStates: readonly HealthState[] = [
		"healthy",
		"exposed",
		"infectious",
		"isolated",
		"recovered",
	];

	for (const healthState of healthStates) {
		const item = createElement("li", "legend-item");
		const swatch = createElement("span", "legend-swatch");
		const label = createElement("span", "legend-label");

		swatch.dataset.health = healthState;
		label.textContent = `${toTitleCase(healthState)} ${counts[healthState]}`;
		item.append(swatch, label);
		legendList.appendChild(item);
	}
}

function renderCurveChart(
	chart: SVGSVGElement,
	history: readonly CurvePoint[],
	passengerCount: number,
): void {
	chart.replaceChildren();

	const frame = createSvgElement("rect", "chart-frame");
	frame.setAttribute("x", "0");
	frame.setAttribute("y", "0");
	frame.setAttribute("width", "320");
	frame.setAttribute("height", "150");
	chart.appendChild(frame);

	const healthStates: readonly HealthState[] = [
		"exposed",
		"infectious",
		"isolated",
		"recovered",
	];

	for (const healthState of healthStates) {
		const path = createSvgElement("polyline", "curve-line");
		path.dataset.health = healthState;
		const points = makeCurvePoints(history, healthState, passengerCount);
		path.setAttribute("points", points);
		chart.appendChild(path);
	}
}

function makeCurvePoints(
	history: readonly CurvePoint[],
	healthState: HealthState,
	passengerCount: number,
): string {
	if (history.length === 0) {
		return "";
	}

	const lastPoint = history[history.length - 1];

	if (lastPoint === undefined) {
		return "";
	}

	const maxTick = Math.max(1, lastPoint.tick);
	const points = history.map(function mapHistoryPoint(point) {
		const x = (point.tick / maxTick) * 300 + 10;
		const ratio = point.counts[healthState] / Math.max(1, passengerCount);
		const y = 140 - ratio * 126;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});
	return points.join(" ");
}

function renderAssumptions(
	assumptionList: HTMLElement,
	scenario: ScenarioConfig,
): void {
	assumptionList.replaceChildren();

	for (const assumption of scenario.assumptions) {
		const item = createElement("li", "assumption-item");
		const label = createElement("strong", "assumption-label");
		const description = createElement("span", "assumption-description");
		label.textContent = assumption.label;
		description.textContent = assumption.description;
		item.append(label, description);
		assumptionList.appendChild(item);
	}
}

function renderSciencePanel(
	sciencePanel: HTMLElement,
	scienceBody: HTMLElement,
	model: RenderModel,
): void {
	sciencePanel.hidden = model.mode !== "science";
	scienceBody.replaceChildren();

	const closeContactRisk = formatRisk(model.controls.closeContactRisk);
	const movementLevel = formatPercent(model.controls.movementGatheringLevel);
	const cleaningEffect = formatPercent(model.controls.cleaningEffect);
	const details = [
		`Incubation time: ${model.controls.incubationTicks} ticks before symptoms.`,
		`Close-contact risk: ${closeContactRisk} per nearby infectious contact.`,
		`Isolation speed: ${model.controls.isolationSpeedTicks} ticks before routing is attempted.`,
		`Movement and gathering: ${movementLevel} scenario intensity.`,
		`Cleaning effectiveness: ${cleaningEffect} scenario assumption.`,
		`Fomite route: ${formatFomiteMode(model.controls.fomiteEnabled)}.`,
	];

	for (const detail of details) {
		const item = createElement("li", "science-detail");
		item.textContent = detail;
		scienceBody.appendChild(item);
	}

	const disclaimer = createElement("li", "science-detail science-disclaimer");
	disclaimer.textContent = EDUCATION_DISCLAIMER;
	scienceBody.appendChild(disclaimer);

	for (const panel of EDUCATION_PANELS) {
		const item = createElement("li", "science-detail science-topic");
		const title = createElement("strong", "science-topic-title");
		const summary = createElement("span", "science-topic-summary");
		title.textContent = panel.title;
		summary.textContent = panel.summary;
		item.append(title, summary);
		scienceBody.appendChild(item);
	}
}

function formatFomiteMode(enabled: boolean): string {
	if (enabled) {
		return "what-if enabled";
	}

	return "off by default";
}

function renderZoneSummary(
	zoneSummaryElement: HTMLElement,
	summary: SimulationSummary,
): void {
	zoneSummaryElement.replaceChildren();

	for (const zoneSummary of summary.zoneSummaries) {
		const zone = getZoneById(zoneSummary.zoneId);
		const item = createElement("li", "zone-summary-item");
		const label = createElement("span", "zone-summary-label");
		const counts = createElement("span", "zone-summary-counts");

		label.textContent = zone.label;
		counts.textContent =
			`H ${zoneSummary.counts.healthy} / E ${zoneSummary.counts.exposed} / ` +
			`I ${zoneSummary.counts.infectious} / Iso ${zoneSummary.counts.isolated}`;
		item.append(label, counts);
		zoneSummaryElement.appendChild(item);
	}
}

function toTitleCase(value: string): string {
	const firstLetter = value.slice(0, 1).toUpperCase();
	const rest = value.slice(1);
	return `${firstLetter}${rest}`;
}

export function createZoneList(): HTMLElement {
	const zoneList = createElement("ul", "zone-list");

	for (const zone of SHIP_ZONES) {
		const item = createZoneItem(zone);
		zoneList.appendChild(item);
	}

	return zoneList;
}

function createZoneItem(zone: ShipZone): HTMLLIElement {
	const item = createElement("li", "zone-item");
	const swatch = createElement("span", "zone-swatch");
	const label = createElement("span", "zone-label");

	swatch.style.backgroundColor = zone.color;
	label.textContent = zone.label;
	item.append(swatch, label);
	return item;
}

export function configureOverlaySvg(svg: SVGSVGElement): void {
	const viewBox =
		`0 0 ${SHIP_LAYOUT.schematicWidth} ${SHIP_LAYOUT.schematicHeight}`;
	svg.setAttribute("viewBox", viewBox);
	svg.setAttribute("role", "img");
	svg.setAttribute("aria-label", "Passenger health states on the ship map");
}

export function setScenarioSelectValue(
	select: HTMLSelectElement,
	scenarioId: ScenarioId,
): void {
	select.value = scenarioId;
}
