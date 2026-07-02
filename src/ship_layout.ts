// Re-export from generated module.
export * from "./ship_layout.generated";
export type * from "./ship_layout.generated";

import { SHIP_LAYOUT } from "./ship_layout.generated";
import type { ShipZone, ZoneId } from "./types/ship";

// Helper: array of all zones for iteration
export const SHIP_ZONES: readonly ShipZone[] = SHIP_LAYOUT.zones;

// Helper: look up a zone by ID. Throws if the ID is not in the layout.
// Invariant: all ZoneId values in the sim flow from SHIP_LAYOUT itself
// (passenger.zoneId is seeded from a layout zone, link arrays reference
// layout zones, summaries iterate layout zones). A missing zone here means
// either a stale generated layout or a code bug; either way, fail loud.
export function getZoneById(id: ZoneId): ShipZone {
  const zone = SHIP_ZONES.find((z) => z.id === id);
  if (zone === undefined) {
    throw new Error(`getZoneById: zone id not found in layout: ${id}`);
  }
  return zone;
}
