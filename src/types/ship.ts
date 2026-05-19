export type ZoneKind =
	| "cabins"
	| "corridor"
	| "public"
	| "medical"
	| "crew"
	| "operations";

export type ZoneId =
	| "cabins_port"
	| "cabins_starboard"
	| "corridor_spine"
	| "dining"
	| "lounge_theater"
	| "pool_deck"
	| "infirmary"
	| "isolation"
	| "crew_area"
	| "helipad";

export type Point = {
	readonly x: number;
	readonly y: number;
};

export type Bounds = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type ShipZone = {
	readonly id: ZoneId;
	readonly label: string;
	readonly kind: ZoneKind;
	readonly bounds: Bounds;
	readonly center: Point;
	readonly links: readonly ZoneId[];
	readonly color: string;
};

export type ShipLayout = {
	readonly schematicWidth: number;
	readonly schematicHeight: number;
	readonly zones: readonly ShipZone[];
};
