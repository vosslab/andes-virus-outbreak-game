import {
	SHIP_SCHEMATIC_HEIGHT,
	SHIP_SCHEMATIC_WIDTH,
} from "./constants";

import type { ShipLayout, ShipZone, ZoneId } from "./types/ship";

export const SHIP_ZONES = [
	{
		id: "cabins_port",
		label: "Cabins (Port)",
		kind: "cabins",
		bounds: { x: 245, y: 82, width: 310, height: 96 },
		center: { x: 400, y: 130 },
		links: ["corridor_spine"],
		color: "#8ecae6",
	},
	{
		id: "cabins_starboard",
		label: "Cabins (Starboard)",
		kind: "cabins",
		bounds: { x: 245, y: 342, width: 310, height: 96 },
		center: { x: 400, y: 390 },
		links: ["corridor_spine"],
		color: "#8ecae6",
	},
	{
		id: "corridor_spine",
		label: "Corridor Spine",
		kind: "corridor",
		bounds: { x: 190, y: 226, width: 805, height: 68 },
		center: { x: 592, y: 260 },
		links: [
			"cabins_port",
			"cabins_starboard",
			"dining",
			"lounge_theater",
			"pool_deck",
			"infirmary",
			"isolation",
			"crew_area",
			"helipad",
		],
		color: "#d9dee2",
	},
	{
		id: "dining",
		label: "Dining",
		kind: "public",
		bounds: { x: 585, y: 88, width: 178, height: 116 },
		center: { x: 674, y: 146 },
		links: ["corridor_spine", "lounge_theater"],
		color: "#f4d35e",
	},
	{
		id: "lounge_theater",
		label: "Lounge / Theater",
		kind: "public",
		bounds: { x: 785, y: 82, width: 176, height: 126 },
		center: { x: 873, y: 145 },
		links: ["corridor_spine", "dining", "pool_deck"],
		color: "#f4d35e",
	},
	{
		id: "pool_deck",
		label: "Pool Deck",
		kind: "public",
		bounds: { x: 610, y: 332, width: 230, height: 110 },
		center: { x: 725, y: 387 },
		links: ["corridor_spine", "lounge_theater", "helipad"],
		color: "#f4d35e",
	},
	{
		id: "infirmary",
		label: "Infirmary",
		kind: "medical",
		bounds: { x: 100, y: 132, width: 110, height: 86 },
		center: { x: 155, y: 175 },
		links: ["corridor_spine", "isolation"],
		color: "#f28b82",
	},
	{
		id: "isolation",
		label: "Isolation",
		kind: "medical",
		bounds: { x: 100, y: 302, width: 110, height: 86 },
		center: { x: 155, y: 345 },
		links: ["corridor_spine", "infirmary"],
		color: "#f28b82",
	},
	{
		id: "crew_area",
		label: "Crew Area",
		kind: "crew",
		bounds: { x: 980, y: 166, width: 116, height: 188 },
		center: { x: 1038, y: 260 },
		links: ["corridor_spine", "helipad"],
		color: "#a3b18a",
	},
	{
		id: "helipad",
		label: "Helipad",
		kind: "operations",
		bounds: { x: 1020, y: 370, width: 112, height: 92 },
		center: { x: 1076, y: 416 },
		links: ["corridor_spine", "crew_area", "pool_deck"],
		color: "#adb5bd",
	},
] as const satisfies readonly ShipZone[];

export const SHIP_LAYOUT: ShipLayout = {
	schematicWidth: SHIP_SCHEMATIC_WIDTH,
	schematicHeight: SHIP_SCHEMATIC_HEIGHT,
	zones: SHIP_ZONES,
};

export function getZoneById(zoneId: ZoneId): ShipZone {
	for (const zone of SHIP_ZONES) {
		if (zone.id === zoneId) {
			return zone;
		}
	}

	throw new Error(`Unknown ship zone: ${zoneId}`);
}
