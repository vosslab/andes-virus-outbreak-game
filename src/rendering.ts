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
const PASSENGER_MOVE_MS = 600;
const PASSENGER_STAGGER_MS = 40;
const PASSENGER_STAGGER_BUCKETS = 8;
const PASSENGER_ZONE_INSET = 0.44;
const PASSENGER_ZONE_SPAN = 0.12;
const PASSENGER_MIN_RADIUS = 2.6;
const PASSENGER_RADIUS_CELL_RATIO = 0.32;

const passengerNodes = new Map<number, SVGCircleElement>();

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

type PassengerPlacement = {
	readonly point: {
		readonly x: number;
		readonly y: number;
	};
	readonly radius: number;
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
	const seenPassengerIds = new Set<number>();
	const placements = createPassengerPlacements(passengers);

	for (const passenger of passengers) {
		seenPassengerIds.add(passenger.id);
		const placement = placements.get(passenger.id);
		if (placement === undefined) {
			throw new Error(`Missing passenger placement: ${passenger.id}`);
		}
		const circle = getOrCreatePassengerNode(overlay, passenger, placement);
		circle.setAttribute("cx", placement.point.x.toFixed(1));
		circle.setAttribute("cy", placement.point.y.toFixed(1));
		circle.setAttribute("r", placement.radius.toFixed(1));
		circle.setAttribute("data-health", passenger.health);
		circle.setAttribute(
			"aria-label",
			`${passenger.label}: ${passenger.health} in ${getZoneById(passenger.zoneId).label}`,
		);
	}

	for (const [passengerId, node] of passengerNodes) {
		if (!seenPassengerIds.has(passengerId)) {
			node.remove();
			passengerNodes.delete(passengerId);
		}
	}
}

function createPassengerPlacements(
	passengers: readonly Passenger[],
): Map<number, PassengerPlacement> {
	const placements = new Map<number, PassengerPlacement>();

	for (const zone of SHIP_ZONES) {
		const zonePassengers = getPassengersInZone(passengers, zone);
		addZonePassengerPlacements(placements, zone, zonePassengers);
	}

	return placements;
}

function getPassengersInZone(
	passengers: readonly Passenger[],
	zone: ShipZone,
): readonly Passenger[] {
	const zonePassengers = passengers
		.filter(function filterPassenger(passenger) {
			return passenger.zoneId === zone.id;
		})
		.sort(comparePassengersById);
	return zonePassengers;
}

function comparePassengersById(left: Passenger, right: Passenger): number {
	const diff = left.id - right.id;
	return diff;
}

function addZonePassengerPlacements(
	placements: Map<number, PassengerPlacement>,
	zone: ShipZone,
	passengers: readonly Passenger[],
): void {
	if (passengers.length === 0) {
		return;
	}

	const grid = getZoneGrid(zone, passengers.length);
	const cellWidth = zone.bounds.width / grid.columns;
	const cellHeight = zone.bounds.height / grid.rows;

	for (let index = 0; index < passengers.length; index += 1) {
		const passenger = passengers[index];
		if (passenger === undefined) {
			throw new Error("Missing passenger while building zone placement");
		}
		const column = index % grid.columns;
		const row = Math.floor(index / grid.columns);
		const jitter = getPassengerJitter(passenger.id);
		const xCellOffset = PASSENGER_ZONE_INSET + PASSENGER_ZONE_SPAN * jitter.x;
		const yCellOffset = PASSENGER_ZONE_INSET + PASSENGER_ZONE_SPAN * jitter.y;
		const point = {
			x: zone.bounds.x + cellWidth * (column + xCellOffset),
			y: zone.bounds.y + cellHeight * (row + yCellOffset),
		};
		const radius = getPassengerRadius(passenger.health, cellWidth, cellHeight);
		placements.set(passenger.id, { point, radius });
	}
}

function getZoneGrid(
	zone: ShipZone,
	passengerCount: number,
): { readonly columns: number; readonly rows: number } {
	const aspectRatio = zone.bounds.width / zone.bounds.height;
	const estimatedColumns = Math.ceil(Math.sqrt(passengerCount * aspectRatio));
	const columns = Math.max(1, estimatedColumns);
	const rows = Math.max(1, Math.ceil(passengerCount / columns));
	const grid = { columns, rows };
	return grid;
}

function getOrCreatePassengerNode(
	overlay: SVGSVGElement,
	passenger: Passenger,
	placement: PassengerPlacement,
): SVGCircleElement {
	const existingNode = passengerNodes.get(passenger.id);

	if (existingNode !== undefined) {
		return existingNode;
	}

	const circle = createSvgElement("circle", "passenger-dot");
	const stagger = (passenger.id % PASSENGER_STAGGER_BUCKETS) * PASSENGER_STAGGER_MS;
	circle.dataset.passengerId = String(passenger.id);
	circle.style.setProperty("--passenger-move-ms", `${PASSENGER_MOVE_MS}ms`);
	circle.style.setProperty("--passenger-stagger", `${stagger}ms`);
	// Seed cx/cy/r before appending so the CSS transition does not animate the
	// circle from the SVG default (0,0,0) to its real spot on first paint --
	// that streak across the hull is what produced the giant red column.
	circle.setAttribute("cx", placement.point.x.toFixed(1));
	circle.setAttribute("cy", placement.point.y.toFixed(1));
	circle.setAttribute("r", placement.radius.toFixed(1));
	circle.setAttribute("data-health", passenger.health);
	overlay.appendChild(circle);
	passengerNodes.set(passenger.id, circle);
	return circle;
}

function getPassengerJitter(
	passengerId: number,
): { readonly x: number; readonly y: number } {
	const xHash = hashPassengerValue(passengerId, 0x45d9f3b);
	const yHash = hashPassengerValue(passengerId, 0x119de1f3);
	const jitter = {
		x: xHash / 0xffffffff,
		y: yHash / 0xffffffff,
	};
	return jitter;
}

function hashPassengerValue(passengerId: number, salt: number): number {
	let value = passengerId + 1;
	value = Math.imul(value ^ salt, 0x7feb352d);
	value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
	const hash = (value ^ (value >>> 16)) >>> 0;
	return hash;
}

function getPassengerRadius(
	health: HealthState,
	cellWidth: number,
	cellHeight: number,
): number {
	const maxRadius = Math.max(
		PASSENGER_MIN_RADIUS,
		Math.min(cellWidth, cellHeight) * PASSENGER_RADIUS_CELL_RATIO,
	);
	const defaultRadius = getDefaultPassengerRadius(health);
	const radius = Math.min(defaultRadius, maxRadius);
	return radius;
}

function getDefaultPassengerRadius(health: HealthState): number {
	if (health === "infectious" || health === "isolated") {
		return 6.2;
	}

	return 5.2;
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
