export type ZoneKind = "cabins" | "corridor" | "public" | "medical" | "crew" | "operations";

export type ZoneId = string;

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

export type DoorSegment = {
  readonly id: string;
  readonly kind: "h" | "v";
  readonly tile: Point;
  readonly segment: readonly [Point, Point];
  readonly roomIds: readonly [ZoneId, ZoneId];
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
  readonly doors: readonly DoorSegment[];
};
