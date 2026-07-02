import { EDUCATION_DISCLAIMER, EDUCATION_PANELS } from "./educational_content";
import { SHIP_LAYOUT, SHIP_ZONES, getZoneById } from "./ship_layout";
import { PERCEPTION_RADIUS } from "./sim_constants";

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
const PASSENGER_MOVE_MS = 100;
const PASSENGER_STAGGER_MS = 40;
const PASSENGER_STAGGER_BUCKETS = 8;
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

export function setModeButtons(elements: AppElements, mode: AppMode): void {
  elements.gameModeButton.setAttribute("aria-pressed", String(mode === "game"));
  elements.scienceModeButton.setAttribute("aria-pressed", String(mode === "science"));
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
  elements.isolationValue.textContent = `${model.controls.isolationSpeedTicks} ticks`;
  elements.movementValue.textContent = formatPercent(model.controls.movementGatheringLevel);
  elements.cleaningValue.textContent = formatPercent(model.controls.cleaningEffect);

  setModeButtons(elements, model.mode);
  renderPassengerOverlay(elements.passengerOverlay, model.passengers);
  renderLegend(elements.legendList, model.summary.counts);
  renderCurveChart(elements.chart, model.history, model.passengers.length);
  renderAssumptions(elements.assumptionList, model.scenario);
  renderSciencePanel(elements.sciencePanel, elements.scienceBody, model);
  renderZoneSummary(elements.zoneSummary, model.summary);
}

function renderPassengerOverlay(overlay: SVGSVGElement, passengers: readonly Passenger[]): void {
  const seenPassengerIds = new Set<number>();

  for (const passenger of passengers) {
    seenPassengerIds.add(passenger.id);
    const radius = getPassengerRadius(passenger.health, 28, 28);
    const circle = getOrCreatePassengerNode(overlay, passenger, {
      point: passenger.position,
      radius,
    });
    circle.setAttribute("cx", passenger.position.x.toFixed(1));
    circle.setAttribute("cy", passenger.position.y.toFixed(1));
    circle.setAttribute("r", radius.toFixed(1));
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

  // Render debug overlay if debug=1 query param is present
  renderDebugOverlay(overlay, passengers);
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

//============================================

function renderDebugOverlay(overlay: SVGSVGElement, passengers: readonly Passenger[]): void {
  // Remove existing debug elements
  const debugGroup = overlay.querySelector("g.debug-overlay");
  if (debugGroup !== null) {
    debugGroup.remove();
  }

  // Check if debug=1 query parameter is present
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "1") {
    return;
  }

  // Create a group for all debug elements
  const group = createSvgElement("g", "debug-overlay");
  group.setAttribute("pointer-events", "none");
  group.setAttribute("opacity", "0.3");

  // Render perception radius circles for each passenger
  for (const passenger of passengers) {
    const circle = createSvgElement("circle", "debug-perception");
    circle.setAttribute("cx", passenger.position.x.toFixed(1));
    circle.setAttribute("cy", passenger.position.y.toFixed(1));
    circle.setAttribute("r", PERCEPTION_RADIUS.toFixed(1));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "blue");
    circle.setAttribute("stroke-width", "0.5");
    group.appendChild(circle);

    // Render steering vector arrow
    const magnitude = Math.sqrt(
      passenger.velocity.x * passenger.velocity.x + passenger.velocity.y * passenger.velocity.y,
    );
    if (magnitude > 0.1) {
      const scale = 10;
      const endX = passenger.position.x + passenger.velocity.x * scale;
      const endY = passenger.position.y + passenger.velocity.y * scale;

      const line = createSvgElement("line", "debug-velocity");
      line.setAttribute("x1", passenger.position.x.toFixed(1));
      line.setAttribute("y1", passenger.position.y.toFixed(1));
      line.setAttribute("x2", endX.toFixed(1));
      line.setAttribute("y2", endY.toFixed(1));
      line.setAttribute("stroke", "green");
      line.setAttribute("stroke-width", "0.5");
      line.setAttribute("marker-end", "url(#debug-arrow-marker)");
      group.appendChild(line);
    }
  }

  // Add arrow marker definition if not present
  if (!overlay.querySelector("#debug-arrow-marker")) {
    const defs = createSvgElement("defs", "");
    const marker = createSvgElement("marker", "");
    marker.setAttribute("id", "debug-arrow-marker");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "5");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");

    const polygon = createSvgElement("polygon", "");
    polygon.setAttribute("points", "0 0, 10 3, 0 6");
    polygon.setAttribute("fill", "green");

    marker.appendChild(polygon);
    defs.appendChild(marker);
    overlay.appendChild(defs);
  }

  overlay.appendChild(group);
}

function getPassengerRadius(health: HealthState, cellWidth: number, cellHeight: number): number {
  const maxRadius = Math.max(
    PASSENGER_MIN_RADIUS,
    Math.min(cellWidth, cellHeight) * PASSENGER_RADIUS_CELL_RATIO,
  );
  const defaultRadius = getDefaultPassengerRadius(health);
  const radius = Math.min(defaultRadius, maxRadius);
  return radius;
}

function getDefaultPassengerRadius(health: HealthState): number {
  if (health === "pre_symptomatic" || health === "symptomatic" || health === "isolated") {
    return 6.2;
  }

  return 5.2;
}

function renderLegend(legendList: HTMLElement, counts: HealthCounts): void {
  legendList.replaceChildren();

  const healthStates: readonly HealthState[] = [
    "healthy",
    "exposed",
    "pre_symptomatic",
    "symptomatic",
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
    "pre_symptomatic",
    "symptomatic",
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

function renderAssumptions(assumptionList: HTMLElement, scenario: ScenarioConfig): void {
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

  if (model.summary.derived !== undefined) {
    const r0 = model.summary.derived.effective_r0;
    const rt = model.summary.derived.effective_rt;
    const herdThreshold = formatPercent(model.summary.derived.approx_herd_threshold);
    const r0Text = isFinite(r0) ? r0.toFixed(2) : "Inf";
    const rtText = isFinite(rt) ? rt.toFixed(2) : "Inf";
    details.push(
      `Effective R0: ${r0Text} (avg secondary infections per case).`,
      `Effective Rt: ${rtText} (live, adjusted for susceptible population).`,
      `Approx. herd immunity threshold: ${herdThreshold}.`,
    );
  }

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

function renderZoneSummary(zoneSummaryElement: HTMLElement, summary: SimulationSummary): void {
  zoneSummaryElement.replaceChildren();

  for (const zoneSummary of summary.zoneSummaries) {
    const zone = getZoneById(zoneSummary.zoneId);
    const item = createElement("li", "zone-summary-item");
    const label = createElement("span", "zone-summary-label");
    const counts = createElement("span", "zone-summary-counts");

    label.textContent = zone.label;
    counts.textContent =
      `H ${zoneSummary.counts.healthy} / E ${zoneSummary.counts.exposed} / ` +
      `PS ${zoneSummary.counts.pre_symptomatic} / S ${zoneSummary.counts.symptomatic} / Iso ${zoneSummary.counts.isolated}`;
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
  const viewBox = `0 0 ${SHIP_LAYOUT.schematicWidth} ${SHIP_LAYOUT.schematicHeight}`;
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Passenger health states on the ship map");
}

export function setScenarioSelectValue(select: HTMLSelectElement, scenarioId: ScenarioId): void {
  select.value = scenarioId;
}
