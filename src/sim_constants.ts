/**
 * Provisional simulation constants tuple.
 *
 * These four values are coupled: changing any one invalidates the M7
 * SEPIR calibration. M7 holds them constant during its sweep and writes
 * the calibrated tuple back into this file. Any later change forces a
 * recalibration cycle per plan risk R2.
 *
 * Values are provisional until M7 lands.
 */

/** Tick-to-day mapping. 1 tick = 6 simulated minutes = 1/240 day. Per plan Q2. */
export const DT_DAYS = 1 / 240;

/** Contact radius (pixels). Two agents within this distance count as a contact pair. */
export const CONTACT_RADIUS = 28;

/** Spatial hash cell size (pixels). Provisional; M8 perf tuning may adjust + force recalibration. */
export const SPATIAL_HASH_CELL_SIZE = 56;

/** Perception radius (pixels). Max distance an agent can see neighbors. */
export const PERCEPTION_RADIUS = 84;

/** Calibrated M7b multiplier on per-pair beta in homogeneous-mixing limit. TODO: M7b calibration pending */
export const BETA_PAIR_SCALE = 1.0;

/**
 * Physical radius of a passenger avatar (pixels).
 * Two passengers whose centers are closer than 2 * PASSENGER_RADIUS are overlapping.
 * Added in M10.5: resolveOverlaps enforces hard separation using this radius.
 * Changing this value may affect perceived crowding density and steering separation
 * distance; recalibrate separation weight if crowd behavior changes significantly.
 * Part of the M7 calibration tuple per risk R2: any change here may affect contact
 * frequency and should trigger a recalibration check.
 */
export const PASSENGER_RADIUS = 4;
