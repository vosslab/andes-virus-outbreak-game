# Code architecture

High-level design of the hantavirus outbreak simulator. Describes how a single tick advances the
world, which modules own which concern, and where calibration and performance constraints live.

## Tick pipeline

Each simulation tick advances `DT_DAYS` of in-world time. The pipeline phases run in a fixed order
so that exposure decisions in phase 5 see the same world that movement produced in phase 2:

1. Build spatial hash. Bucket every passenger into a uniform grid keyed by `SPATIAL_HASH_CELL_SIZE`
   so neighbor queries in later phases stay O(1) per agent.
2. Move passengers. Blend Reynolds-style steering primitives (seek, separate, arrive, wander) into
   a desired velocity, then clamp against polygon room boundaries. Door passage uses stateless
   force-field gaps rather than tracked door entities.
3. Progress health. Advance SEPIR transitions (susceptible to exposed to pre-symptomatic infectious
   to symptomatic infectious to recovered) using per-agent rates drawn from scenario distributions.
   Increment the per-state day counters.
4. Update zone contamination. Symptomatic and pre-symptomatic agents deposit pathogen load into
   their current zone; zones decay load by a per-tick factor.
5. Expose susceptibles. For each susceptible, query the spatial hash for contacts within
   `CONTACT_RADIUS` and apply pairwise transmission probability scaled by `BETA_PAIR_SCALE`. Add
   a fomite-exposure term from the current zone's contamination level.

## Modules

| File | Purpose |
| --- | --- |
| `src/simulation.ts` | Tick engine, SEPIR transitions, exposure scoring |
| `src/navigation.ts` | Room graph and A* path planning, plus `nextWaypoint` |
| `src/steering.ts` | Composable Reynolds steering primitives |
| `src/collision.ts` | Polygon clamp and force-field door passage |
| `src/spatial_hash.ts` | Uniform-grid neighbor queries and op-count counters |
| `src/perception.ts` | Neighbor lookups by radius on top of the spatial hash |
| `src/named_agent_seed.ts` | Sixteen named seed agents for reproducible classroom demos |
| `src/ship_layout.generated.ts` | Emitted from `data/ship.yaml` by the pipeline |
| `src/ship_layout.ts` | Thin re-export plus `getZoneById` helper |
| `src/epi_derived.ts` | Effective R0, Rt, and herd-immunity computation |
| `src/sim_constants.ts` | Pinned calibration tuple shared by sim and tests |
| `src/random.ts` | Deterministic LCG plus `normalRandom` helper |
| `src/types/*.ts` | Shared type definitions |
| `src/rendering.ts` | DOM and SVG renderer, plus the `?debug=1` overlay |
| `src/scenarios.ts` | Scenario presets, SEPIR rates, agent parameter distributions |
| `src/statistics.ts` | Summary aggregation and derived R0, Rt, herd values |
| `src/ui_state.ts` | App-shell state for buttons and panels |
| `src/init.ts` | App entry point that wires renderer, sim, and UI |
| `pipeline/generate_ship_svg.py` | YAML to SVG plus TypeScript generator |
| `pipeline/compare_ship_svg_bounds.py` | Visual diff for regenerated SVG |
| `pipeline/seir_ode.py` | Ground-truth ODE integrator |
| `pipeline/calibrate_baseline.py` | Calibrates the agent sim against the ODE |
| `pipeline/tune_spatial_hash.py` | Cell-size sweep for spatial-hash performance |

## Force-field doors

Doors are stateless permeable gaps in room polygons (plan item D5). The collision clamp permits
movement across the gap segment and rejects movement across solid wall segments. There is no door
entity, no open/closed flag, and no door-pathfinding heuristic. Closing a room for a scenario means
deleting that gap from `data/ship.yaml` and regenerating `ship_layout.generated.ts`.

## Determinism contract

All randomness flows through `src/random.ts`, which exposes a seeded LCG and a normal-random
helper built on it. Direct `Math.random` use is blocked by ESLint. Same seed plus same scenario
plus same calibration tuple yields a byte-identical position trace across runs and machines.

## Calibration coupling

The calibration tuple `(DT_DAYS, CONTACT_RADIUS, SPATIAL_HASH_CELL_SIZE, PERCEPTION_RADIUS,
BETA_PAIR_SCALE)` is locked together in `src/sim_constants.ts`. Changing any single component
forces a full recalibration against the ODE ground truth. See [EPI_MODEL.md](EPI_MODEL.md) for the
fit procedure and the acceptance bounds on R0 and final size.

## Performance gates

Two budgets gate performance work:

- Op-count budget. `tests/test_perf_op_counts.ts` asserts hard upper bounds on spatial-hash
  inserts, neighbor queries, and pairwise exposure checks per tick. Intended as a hard CI gate
  once the test file is tracked + included in `check_codebase.sh`'s test:node step.
- Wall-clock budget. `tests/e2e/e2e_perf_budget.mjs` measures ms per tick at N=1000. CI runs it
  warn-only because shared-runner timing is noisy; the local target is 16 ms per tick.

Current measurement is approximately 240 ms per tick at N=1000, about 15x over the 16 ms target.
The cell-size sweep in `pipeline/tune_spatial_hash.py` is the active study against this gap.

## References

- [SHIP_YAML_SPEC.md](SHIP_YAML_SPEC.md)
- [EPI_MODEL.md](EPI_MODEL.md)
- [ARTIFICIAL_LIFE.md](ARTIFICIAL_LIFE.md)
- [SEIR_Simulation.md](SEIR_Simulation.md)
- [FILE_STRUCTURE.md](FILE_STRUCTURE.md)
