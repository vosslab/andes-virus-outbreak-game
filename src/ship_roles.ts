import type { ZoneId } from "./types/ship";

// Group 37 new zones by simulation role for easy reference in gameplay logic

/** Cabin zones where passengers stay or return to */
export const CABIN_ZONE_IDS: readonly ZoneId[] = [
  "cab_p1",
  "cab_p2",
  "cab_p3",
  "cab_p4",
  "cab_s1",
  "cab_s2",
  "cab_s3",
  "cab_s4",
  "suite_p",
  "suite_s",
] as const;

/** Medical zones used for isolation logic */
export const MEDICAL_ZONE_IDS: readonly ZoneId[] = ["infirmary", "isolation"] as const;

/** Corridor zones (primary movement arteries) */
export const CORRIDOR_ZONE_IDS: readonly ZoneId[] = ["corr_p", "corr_s"] as const;

/** Public gathering zones with high exposure multiplier */
export const PUBLIC_ZONE_IDS: readonly ZoneId[] = [
  "obs_p",
  "obs_s",
  "spa",
  "library",
  "dining",
  "casino",
  "theater",
  "pool",
  "arcade",
  "kids",
  "gym",
] as const;

/** Crew areas (lower passenger exposure, higher contact) */
export const CREW_ZONE_IDS: readonly ZoneId[] = [
  "galley",
  "crew_q",
  "crew_mess",
  "engineering",
] as const;

/** Operations zones (command, comms, tenders) */
export const OPERATIONS_ZONE_IDS: readonly ZoneId[] = [
  "bridge",
  "comms",
  "tender_bay",
  "helideck",
  "sun_deck",
  "lifeboats_p",
  "lifeboats_s",
] as const;
