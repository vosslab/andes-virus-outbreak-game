# Plan: Agent-based passenger rewrite, YAML-driven ship geometry, and lint cleanup

## Context

The Hantavirus Cruise Ship Simulator currently models passengers as zone-bucketed agents that
teleport between named rooms each tick. Health is per-passenger (deterministic LCG, strict
TypeScript), but motion is not: the only "where am I" data is `zoneId`, and infection is computed
from zone occupancy plus an optional fomite term. This produces correct epidemic curves but
mechanical, non-agent-like visuals -- dots snap from cell to cell with no perception, no avoidance,
no social structure, and no continuous space.

Three concurrent problems block the next step:

1. **Ship not rendering (regression).** Commit `118d8f6 "updates from starter repo"` overwrote
   `build_github_pages.sh` with a generic version that no longer copies `src/ship_schematic.svg`
   into `dist/`. `dist/` ships `index.html`, `main.js`, `main.js.map`, `style.css` only, so the
   `<object>` / fetch for the schematic 404s and the hull never appears.
2. **Lint infrastructure broken.** `eslint.config.js` exists and imports `@eslint/js`,
   `typescript-eslint`, and `globals`, but none of these dev dependencies are installed.
   `npm run lint` fails before producing a single finding. `tsc --noEmit` passes.
3. **Geometry duplicated by hand.** Zone bounds live both in `src/ship_layout.ts` (typed records)
   and in `src/ship_schematic.svg` (hand-authored paths and rects). The two must stay in sync
   manually, which has already produced visual artifacts (helipad protrusion, giant red cross,
   passenger-dot streaking from 0,0) that were fixed by editing the SVG and TS separately. An
   agent-based rewrite that needs a navigation mesh and obstacle map cannot tolerate two sources
   of truth for room polygons.

The agent rewrite uses `docs/ARTIFICIAL_LIFE.md` as conceptual guide, not as spec. The doc names
the relevant primitives -- Reynolds steering (separation, alignment, cohesion, target seeking,
obstacle avoidance), stochastic per-agent variation, herding under uncertainty, continuous space
with spatial hashing, restricted local perception -- and warns about the recurring failure modes
(oscillation, deadlock, homogeneity, scalability). The plan translates those primitives into a
concrete TypeScript implementation while replacing the zone-teleport motion model with
continuous-space steering inside polygonal rooms generated from a YAML spec.

The epidemiological model is rewritten in parallel. The current model has ad-hoc parameters
(`exposureChanceByContact`, `contaminationDecay`, etc.) that are hard to relate to the literature.
The rewrite adopts the standard **SEIR/SEIRS** compartmental model as described in
`docs/SEIR_Simulation.md` (Kermack-McKendrick lineage; mass-action `betaSI/N` form). Explicit
rates:

- beta (transmission rate; per day in mass-action form `betaSI/N`)
- sigma (rate exposed -> infectious; latent period = 1/sigma)
- gamma (rate infectious -> recovered; infectious period = 1/gamma)
- omega (rate recovered -> susceptible; immunity period = 1/omega; omega=0 recovers SEIR)
- R0 = beta / gamma (derived, displayed; per `docs/SEIR_Simulation.md` normalized form)
- Rt = R0 * S/N (derived, displayed; the time-varying effective reproduction number)
- Herd immunity threshold = 1 - 1/R0 (derived, displayed)

Agent-level state still uses the discrete `HealthState` union, but transitions are now governed
by these rates applied per-tick via the standard `p = 1 - exp(-rate * dt)` conversion, with
contact-driven beta computed from continuous-space proximity rather than zone occupancy. This
is the agent-based / stochastic counterpart of the deterministic ODE system in
`docs/SEIR_Simulation.md`; both forms must agree in the large-N mean-field limit.

## Objectives

- Replace duplicate hand-maintained geometry with a YAML room spec that emits both the runtime
  `ShipLayout` data structure and the rendered SVG hull. Restoring visible ship rendering is a
  byproduct of this milestone (the generator's build output puts the SVG back into `dist/`).
- Promote passengers from zone-bucketed entities to continuous-space autonomous agents with
  perception, steering, and heterogeneous parameters.
- Replace the ad-hoc infection parameters with a standard SEIRS model driven by beta, sigma,
  gamma, omega, with R0 displayed as a derived quantity. Surface these as the primary scenario
  knobs.
- Scale the simulation to 1000+ passengers in the browser by introducing a spatial hash and
  measuring tick cost.
- Bring `npm run lint` to zero warnings, zero errors, with the eslint toolchain installed and
  pinned in `package.json`.
- Add unit tests for simulation primitives so the agent rewrite is verifiable in pytest-fast
  time, not only via Playwright smoke.

## Design philosophy

Cite the `docs/REPO_STYLE.md` core philosophies that this plan leans on:

- **Fix the design, not the symptom.** The ship-not-rendering bug is a build-script regression;
  the fix is to restore asset copying, not to bake the SVG into JS. Geometry duplication is the
  deeper design defect, so it gets a dedicated milestone (M2) before agents land.
- **Long-term over short-term.** Agent rewrite costs more now than tuning zone-bucket constants,
  but unlocks emergent behaviors (lane formation, helping behavior, herding near exits) the
  current model cannot produce. The YAML generator costs a milestone but kills a recurring
  drift-bug class.
- **Atomic task decomposition + fresh subagent per task.** Each milestone splits into independent
  workstreams sized for one coder; M3 (agent infrastructure) and M4 (steering rules) are wired so
  they can dispatch via `parallel-plan`.

Rejected alternative: a "lite" rewrite that keeps zone buckets but adds intra-zone (x,y) jitter
and a Boids alignment term. Rejected because it cannot model exit congestion, doorway deadlock,
or social-group cohesion -- the very phenomena `docs/ARTIFICIAL_LIFE.md` highlights as why
agent-based models exist. A half-step would still leave geometry duplicated and would not justify
the disruption.

## Scope

- Install eslint toolchain (`eslint`, `@eslint/js`, `typescript-eslint`, `globals`) and a
  pinned Prettier; fix every emitted lint diagnostic.
- Add `data/ship.yaml` and `pipeline/generate_ship_svg.py` that emit `src/ship_schematic.svg` and
  `src/ship_layout.generated.ts` from one source. Update `build_github_pages.sh` so the build
  pipeline regenerates and copies the SVG, restoring ship rendering as a side effect.
- Rewrite `src/simulation.ts` core to operate on continuous 2D position per passenger; add
  perception (spatial hash), steering blend, polygonal obstacle avoidance, target selection
  (current `zoneId` becomes the agent's current-goal room).
- Replace ad-hoc infection parameters with SEIR/SEIRS rates (beta, sigma, gamma, omega) per
  `docs/SEIR_Simulation.md`. Display derived values R0, Rt, and the herd immunity threshold.
  Drive contact rate from continuous-space proximity.
- Introduce per-passenger heterogeneity (walking speed, reaction time, risk tolerance,
  contact-rate multiplier) drawn from seeded distributions.
- Raise default crowd-cap target to 1000+; verify with a perf budget on `tick()` (target
  < 16 ms per tick at 1000 agents on a baseline laptop).
- Update rendering to interpolate dot motion from per-tick agent positions, drop the per-zone
  grid layout entirely.
- Add pytest / `node --test` unit tests for steering primitives, perception, spatial hash, and
  SEIRS rate transitions; add a Playwright assertion that the schematic renders on first paint.

## Non-goals

- Do not introduce machine learning, reinforcement learning, or neural navigation. Steering rules
  are hand-designed per `docs/ARTIFICIAL_LIFE.md` historical section.
- Do not introduce social groups (families, friend clusters, leader-follow). Deferred. Agents are
  individuals with heterogeneous parameters only. No `src/social.ts`.
- Do not replace the deterministic LCG with a non-deterministic RNG. Reproducibility from a seed
  is a hard contract.
- Do not change the public scenario *preset name* list (the five preset names stay). Scenario
  *parameter* names may migrate to the rate set (beta, sigma, gamma, omega, ...); a documented
  old-name -> new-name mapping ships with the change. The educational disclaimer copy stays.
- Do not refactor `src/init.ts` shell-build code or `src/educational_content.ts` beyond what the
  rewrite requires; `src/statistics.ts` will be updated to surface R0 and current rates.
- Do not introduce multi-deck (3D) ship geometry. Top-down 2D only.
- Do not gate the live preview on Playwright; the smoke remains a CI check, not a release
  blocker.

## Current state summary

- TypeScript strict mode passes: `npx tsc --noEmit -p src/tsconfig.json` is green on `main`.
- `npm run lint` is broken: eslint deps not installed; the config file is otherwise valid.
- `dist/ship_schematic.svg` is missing; `dist/` ships only `index.html`, `main.js`,
  `main.js.map`, `style.css`. Root cause: `build_github_pages.sh` rewritten by commit `118d8f6`
  no longer contains `cp src/ship_schematic.svg dist/ship_schematic.svg` or the
  `test -f dist/ship_schematic.svg` assertion that the previous version (`a1679e6`) had.
- Passenger model: `Passenger` record with `id`, `label`, `health`, `zoneId`, `cabinZoneId`,
  health-state timestamps. No (x,y). Movement = pick destination zone by weighted choice each
  tick. Exposure = per-pair-in-zone Bernoulli plus zone-level fomite term.
- Rendering: stable per-id SVG `<circle>` nodes; CSS transitions on `cx`/`cy` provide the only
  motion smoothing. Layout is per-zone adaptive grid with deterministic jitter.
- Tests: lint/format gates in pytest (`tests/test_typescript_tsc.py`,
  `tests/test_typescript_eslint.py`, ASCII / whitespace / indent / shebangs / package-json
  schema / tsconfig canonical / markdown links / readme-first-paragraph); Playwright smoke
  (`tests/playwright/smoke_app.mjs`). **No unit tests for simulation logic.**
- Source size: ~2,400 LOC across 13 TS files; `src/init.ts` (510) and `src/simulation.ts` (624)
  are the largest. Agent rewrite is concentrated in `simulation.ts`, `rendering.ts`,
  `types/simulation.ts`, and a new `src/agent_*.ts` module set.

## Architecture boundaries and ownership

| Boundary | Component | Owner module(s) | Stability after rewrite |
| --- | --- | --- | --- |
| Geometry source of truth | YAML spec | `data/ship.yaml` | New; replaces hand-edited SVG |
| Geometry codegen | Python generator | `pipeline/generate_ship_svg.py` | New; not shipped to browser |
| Static room data | TS layout | `src/ship_layout.generated.ts` | New; emitted, not hand-edited |
| Hull artwork | SVG | `src/ship_schematic.svg` | Generated, not hand-edited |
| Agent record | Type | `src/types/simulation.ts` | Rewritten: + position, velocity, params |
| Tick engine | Simulation | `src/simulation.ts` | Rewritten: steering, perception, infection-radius |
| Perception index | Spatial hash | `src/spatial_hash.ts` (new) | New |
| Steering rules | Steering | `src/steering.ts` (new) | New |
| Room-graph navigation | Path planner | `src/navigation.ts` (new) | New; computes room-graph paths and waypoint sequences feeding `targetSeek` |
| RNG | LCG | `src/random.ts` | Unchanged; new helpers may be added |
| Rendering | DOM/SVG | `src/rendering.ts` | Adapted: drop grid, read agent (x,y) directly |
| App shell | Entry | `src/init.ts` | Touched only for new control wiring |

### Mapping (milestones / workstreams -> components / patches)

- **M0a ship-render hotfix**: `build_github_pages.sh`, `docs/CHANGELOG.md`. 1 patch.
- **M0b lint deps**: `package.json`, `package-lock.json`. 1 patch.
- **M1 lint cleanup**: existing TS files -> diagnostics by rule family. 3-5 patches.
- **M2 YAML geometry + build pipeline**: `data/ship.yaml`, `pipeline/generate_ship_svg.py`,
  `pipeline/compare_ship_svg_bounds.py`, `data/reference/ship_schematic_pre_m2.svg`,
  `src/ship_layout.generated.ts`, `src/ship_schematic.svg`, `build_github_pages.sh`,
  `tests/playwright/smoke_app.mjs`, `tests/test_ship_svg_visual_bounds.py`. 3-4 patches.
- **M3 agent infrastructure**: `src/types/simulation.ts`, `src/spatial_hash.ts`,
  `src/random.ts`. 2-3 patches.
- **M4 room-graph navigation**: `src/navigation.ts`, `tests/test_navigation.mjs`. 1-2 patches.
- **M5 steering**: `src/steering.ts`, `src/sim_constants.ts`, `src/simulation.ts` (movement
  phase only). 2-3 patches.
- **M6 epidemiology refactor**: `src/types/simulation.ts`, `src/simulation.ts` (exposure +
  transitions), `src/scenarios.ts`, `src/statistics.ts`, `docs/EPI_MODEL.md` (draft). 2-3
  patches.
- **M7 calibration + ODE validation**: `devel/calibrate_baseline.py`, `devel/seir_ode.py`,
  `tests/e2e/e2e_seir_validation.sh`, `docs/EPI_MODEL.md` (final). 1-2 patches.
- **M8 heterogeneity + 1000-agent perf**: `src/simulation.ts` init, scenario plumbing,
  `tests/test_perf_op_counts.mjs`, `tests/e2e/e2e_perf_budget.mjs`,
  `devel/tune_spatial_hash.py`. 2-3 patches.
- **M9 rendering**: `src/rendering.ts`. 1-2 patches.
- **M10 docs + close-out**: `README.md`, `docs/CHANGELOG.md`, `docs/CODE_ARCHITECTURE.md`,
  `docs/FILE_STRUCTURE.md`, `docs/EPI_MODEL.md`, `docs/SHIP_YAML_SPEC.md`. 1-2 patches.

## Milestone plan

### M0a -- Ship-render hotfix (one-line restore)

- Depends on: none. Priority: immediate.
- Deliverables:
  - Restore the asset-copy line and the existence assertion in `build_github_pages.sh` so
    `dist/ship_schematic.svg` is produced again. Two lines total:
    `cp src/ship_schematic.svg dist/ship_schematic.svg` and
    `test -f dist/ship_schematic.svg`.
  - One-line `docs/CHANGELOG.md` entry under "Fixes and Maintenance".
- Exit criteria:
  - `./build_github_pages.sh` produces `dist/ship_schematic.svg`.
  - `./run_web_server.sh` shows the hull on first paint.
  - `npm run smoke` passes the schematic-rendered assertion.
- Parallel-plan ready: no -- single trivial patch.

### M0b -- Install lint toolchain

- Depends on: none. Runs in parallel with M0a.
- Deliverables:
  - eslint, `@eslint/js`, `typescript-eslint`, `globals`, and `prettier` listed in
    `package.json` devDependencies with pinned versions; `package-lock.json` regenerated.
  - `npm run lint` runs and emits findings (cleanup happens in M1).
- Exit criteria:
  - `npm run lint` exits with a non-zero status only because of findings, never because the
    toolchain is absent.
  - `pytest tests/test_typescript_eslint.py` collects and runs (passing or failing on findings,
    but not on missing dependencies).
  - Obvious follow-on: bump `docs/CHANGELOG.md` (Fixes and Maintenance), rerun
    `./check_codebase.sh`.
- Parallel-plan ready: yes. M0a (build script) and M0b (lint deps) run concurrently.

### M1 -- Lint cleanup to zero warnings

- Depends on: M0.
- Deliverables: all eslint diagnostics resolved across `src/`, `tests/`, and root TS files;
  Prettier formatting applied.
- Exit criteria:
  - `npm run lint -- --max-warnings 0` exits 0.
  - `npx prettier --check .` exits 0.
  - `pytest tests/test_typescript_eslint.py tests/test_typescript_tsc.py` passes.
  - Obvious follow-on: `docs/CHANGELOG.md`, rerun `./check_codebase.sh`.
- Parallel-plan ready: yes. Partition findings by rule family across workstreams so two coders
  do not edit the same lines.

### M2 -- YAML geometry generator (single source of truth)

- Depends on: M0a (build script must be sane before the generator extends it). Lint-clean code
  in M1 is preferred before the generator emits new TS.
- Deliverables:
  - `data/ship.yaml` describing zones (id, label, kind, polygon vertices, links, color, label
    position, icon, doorway points). Polygons are mandatory; rect bounds are an optional
    convenience for axis-aligned rooms (compiled to four-vertex polygons internally).
  - `pipeline/generate_ship_svg.py` reads YAML, emits `src/ship_schematic.svg` and
    `src/ship_layout.generated.ts` (a TS literal matching the existing `ShipLayout` shape plus
    new fields needed by M4: polygon vertices, doorway centerpoints, navmesh edges).
  - `src/ship_layout.ts` becomes a thin re-export of the generated module.
  - `build_github_pages.sh` calls the generator (or asserts freshness) ahead of the existing
    `cp` + `test -f` lines added in M0a, so the build path stays a single source of truth.
  - `tests/test_ship_layout_generated.py` asserts the generator output is up to date relative
    to `data/ship.yaml` (re-run the generator and `git diff --quiet`).
  - `pipeline/compare_ship_svg_bounds.py` extracts per-zone bounding boxes from two SVGs and
    reports per-zone delta. Inputs: a reference SVG (the M0a baseline, copied to
    `data/reference/ship_schematic_pre_m2.svg` at the start of M2) and the generator output.
    Output: a JSON report with `{zone_id: {dx, dy, dw, dh, max_rel_error}}` plus a pass/fail
    summary at the 2% relative-error threshold.
  - `tests/test_ship_svg_visual_bounds.py` runs `compare_ship_svg_bounds.py` and asserts every
    zone's `max_rel_error <= 0.02`.
- Exit criteria:
  - `tests/test_ship_svg_visual_bounds.py` is green.
  - Per-zone max relative bound error is <= 2% vs `data/reference/ship_schematic_pre_m2.svg`.
  - `./build_github_pages.sh` produces `dist/ship_schematic.svg`; `./run_web_server.sh` shows
    the hull on first paint.
  - `npm run smoke` passes the schematic-rendered assertion.
  - `pytest tests/` is green including the new freshness check.
  - Obvious follow-on: `docs/SHIP_YAML_SPEC.md` added under the "Repo-specific docs" section
    of `docs/REPO_STYLE.md`.
- Parallel-plan ready: yes. WS-M2a (YAML schema + generator), WS-M2b (build script update +
  smoke assertion), WS-M2c (consumer updates in `src/ship_layout.ts`), WS-M2d (pytest
  freshness check + docs) fan out after WS-M2a publishes the YAML schema (1-coder sync point).

### M3 -- Agent state and perception

- Depends on: M2 (perception consumes polygons + doorways).
- Deliverables:
  - `Passenger` type gains `position: {x, y}`, `velocity: {x, y}`, and `params: AgentParams`
    (speed, reaction time, sociability, risk tolerance). All seeded; reproducible.
  - `src/spatial_hash.ts` provides O(1) neighbor queries within a radius.
  - Perception helper: given a passenger and radius, return list of other passenger ids in
    line-of-sight (no wall occlusion in v1; doorway-bounded only).
  - Initial placement: agents start at deterministic positions inside their cabin polygon,
    not at zone centroid.
- Exit criteria:
  - Unit tests in `tests/test_spatial_hash.mjs` cover insert / query / move.
  - Unit tests in `tests/test_perception.mjs` cover radius-window correctness on a fixture.
  - Determinism: re-running with same seed produces byte-identical position trace for first
    100 ticks.
  - Obvious follow-on: regenerate `docs/CODE_ARCHITECTURE.md` agent state diagram.
- Parallel-plan ready: yes. WS-M3a (types + init), WS-M3b (spatial hash + tests),
  WS-M3c (perception + tests) are independent once the `Passenger` type lands in WS-M3a.

### M4 -- Room-graph navigation

- Depends on: M2 (room polygons + doorways), M3 (agent state).
- Deliverables:
  - `src/navigation.ts` builds a room adjacency graph from the YAML-derived layout, with
    doorways as graph edges. Each edge stores a waypoint (the doorway midpoint) and a
    traversable line segment so steering can target the doorway opening, not just the next
    room's centroid.
  - `planRoomPath(fromZoneId, toZoneId)` returns an ordered list of zones via
    distance-weighted A* per Q4 (edge weight = Euclidean distance between doorway midpoints);
    cached per (from, to) pair.
  - `nextWaypoint(agent)` returns the current target point: either the doorway leading to the
    next room on the path, or, once inside the goal room, a point inside that room's polygon.
  - Agents store `path: ZoneId[]` and `pathIndex: number` derived from the planner; the existing
    weighted-zone destination logic produces the goal zone, then `navigation.ts` produces the
    sequence of intermediate waypoints.
- Exit criteria:
  - Unit tests in `tests/test_navigation.mjs` cover: graph build from a fixture YAML,
    shortest-path between every pair of zones, doorway-midpoint correctness, replan when an
    agent ends up in an unexpected room.
  - No goal is unreachable in the baseline ship.
  - Obvious follow-on: refresh the architecture diagram in `docs/CODE_ARCHITECTURE.md`.
- Parallel-plan ready: yes. WS-M4a (graph build) and WS-M4b (path planner + waypoint API) split
  cleanly; WS-M4c (agent integration) depends on both.

### M5 -- Steering and continuous-space movement

- Depends on: M3, M4.
- Deliverables:
  - `src/steering.ts` exports composable rules: `separation`, `alignment`, `cohesion`,
    `targetSeek` (toward `navigation.nextWaypoint(agent)`), `obstacleAvoid` (vs room polygon
    walls), `doorwayBias` (toward the current edge's waypoint line segment).
  - `src/simulation.ts` movement phase blends steering vectors with per-agent weights (the
    `AgentParams`); destination selection still uses the existing weighted-zone logic, but the
    agent walks the room-graph path produced by M4 instead of teleporting.
  - Wall and corridor collisions resolved by polygon clamping after the steering step. Agents
    never look up the next-room waypoint by line-of-sight; they always defer to
    `navigation.ts`, which is wall-aware by construction.
  - Movement is rate-limited by agent `speed` and tick duration.
  - **`src/sim_constants.ts`** (new): canonical, checked-in tuple `(dt, contact_radius,
    spatial_hash_cell_size, perception_radius)` that calibration in M7 depends on. Initial
    values are provisional; M7 fixes them. Any later change to this file requires recalibration
    per the rollout checklist.
- Exit criteria:
  - Unit tests for each steering rule with fixture inputs in `tests/test_steering.mjs`.
  - No agent crosses a wall over a 10,000-tick stress run on the baseline scenario (headless
    `node --test` driver).
  - Deadlock guard: if any passenger fails to move for > N ticks, the simulation logs a warning
    and applies a small random perturbation (per `docs/ARTIFICIAL_LIFE.md` recurring-failures
    section).
  - Obvious follow-on: `docs/CHANGELOG.md`, rerun `./check_codebase.sh`.
- Parallel-plan ready: yes. WS-M5a (steering primitives), WS-M5b (collision + polygon clamp),
  WS-M5c (simulation movement integration that wires navigation + steering together) -- the
  first two are independent; WS-M5c depends on both.

### M6 -- Epidemiology refactor: rate-based SEIR/SEIRS transitions

- Depends on: M5. Authoritative model spec: `docs/SEIR_Simulation.md`.
- Scope of this milestone is the parameter and transition refactor only. Calibration,
  ODE comparison, and final-size validation live in M7.
- Deliverables:
  - Replace the ad-hoc parameters (`exposureChanceByContact`, `incubationTicks`,
    `infectiousTicks`, `isolationAfterInfectiousTicks`, `contaminationDecay`) with the rate set
    in `src/types/simulation.ts` and `src/scenarios.ts`:
    - `beta_target` (effective transmission rate; the per-day rate the simulation aims to
      reproduce in a homogeneous-mixing limit, calibrated in M7)
    - `sigma = 1 / latent_period_days`
    - `gamma = 1 / infectious_period_days`
    - `omega = 1 / immunity_period_days` (omega = 0 recovers the SEIR special case)
    - Optional `isolation_goal_rate` (behavioral intervention, not a SEIRS transition rate;
      per-day probability that an infectious agent adopts the isolation goal state, which
      drives navigation to the medical bay or cabin per Q5; kept for the curriculum scenario)
  - Surface derived display values in the stats panel via `src/statistics.ts`. Per the
    revision notes, these are **calibrated effective equivalents**, not direct mechanistic
    truths -- the agent simulation is spatial and contact-radius based, while the closed forms
    assume homogeneous mass-action mixing (`docs/SEIR_Simulation.md` discusses this
    limitation). Labels in the UI should say "effective R0", "effective Rt", "approx. herd
    immunity threshold":
    - effective R0 = `beta_target / gamma`
    - effective Rt = `effective R0 * S / N` (recomputed each tick)
    - approx. herd immunity threshold = `1 - 1 / effective R0`
  - Exposure phase: for each healthy agent, perception queries the spatial hash for infectious
    agents within `contact_radius`; per-tick infection probability per nearby infectious agent
    is `1 - exp(-beta_pair * dt)`, where `beta_pair` is the per-pair rate that calibrates to
    `beta_target` in the homogeneous-mixing limit. `dt` is the tick-to-day mapping from Q2.
  - E -> I, I -> R, R -> S transitions evaluated each tick with `1 - exp(-rate * dt)`. The
    discrete `HealthState` union stays.
  - Fomite term retained but rescaled into a per-zone effective beta contribution rather than a
    separate Bernoulli draw.
- Exit criteria:
  - Stats panel displays the three effective values, labeled as calibrated effective
    equivalents (not mechanistic identities).
  - Unit tests in `tests/test_seirs_transitions.mjs` cover each transition's rate-to-prob
    conversion, the omega=0 boundary, and the Rt formula at the per-tick level.
  - No regression in determinism (G3 still green).
  - Obvious follow-on: update `docs/CODE_ARCHITECTURE.md` infection-model section; draft
    `docs/EPI_MODEL.md` with the rate definitions and a pointer to the calibration in M7.
- Parallel-plan ready: yes. WS-M6a (types + scenario rename), WS-M6b (transition machinery in
  `simulation.ts`), WS-M6c (UI labels + statistics) are independent after the type lands.

### M7 -- Calibration and SEIR/ODE validation

- Depends on: M6.
- Deliverables:
  - `devel/calibrate_baseline.py` sweeps `beta_pair` and `contact_radius` (reading from
    `src/sim_constants.ts`) to find values that reproduce a target `beta_target` (and therefore
    a target effective R0) in the homogeneous-mixing fixture (single large room, large N).
    The calibration writes the resulting tuple back into `src/sim_constants.ts` and marks it
    "calibrated"; any later change to that file invalidates calibration.
  - A pure deterministic SEIR ODE integrator in `devel/seir_ode.py` for cross-checks.
  - `tests/e2e/e2e_seir_validation.sh` runs the homogeneous-mixing fixture at N=1000 and
    compares stochastic mean trajectories against the ODE.
  - The calibration result is written back into the scenario file or a small constants module.
- Exit criteria:
  - SEIR mean-field check: in a single-room homogeneous-mixing fixture at N=1000, omega=0,
    stochastic peak prevalence and time-to-peak match the deterministic SEIR ODE within +-10%
    averaged across 32 seeds.
  - SEIR final-size check: 1 - S_inf matches `1 - exp(-R0 * (1 - S_inf))` within +-5% across
    the same 32 seeds.
  - Baseline ship scenario effective R0 within +-10% of analytic target after calibration.
  - The calibration constants are documented in `docs/EPI_MODEL.md` with cell-size,
    perception-radius, and tick-duration pairings (Risk R2 mitigation).
  - Obvious follow-on: cross-reference `docs/EPI_MODEL.md` from `docs/SEIR_Simulation.md`.
- Parallel-plan ready: no -- calibration is single-threaded.

### M8 -- Heterogeneity and perf scale-up to 1000+ agents

- Depends on: M3 (params shape), M5 (steering hooks), M6 (rates).
- Deliverables:
  - Per-agent param distributions drawn from seeded normal / truncated-normal distributions
    (`speed`, `reaction_time`, `contact_multiplier`, `risk_tolerance`); distribution parameters
    surfaced as scenario knobs with sane defaults.
  - Default crowd size cap raised from 180 to 1000; scenarios document an explicit `N` field.
  - **Deterministic operation-count budgets** (the hard CI gate):
    - `tests/test_perf_op_counts.mjs` instruments one canonical tick at N=1000 and asserts:
      - neighbor queries per tick <= 1000 (one per agent),
      - candidates returned per query <= 64 (perception radius cap),
      - heap allocations per tick within a documented envelope (assert with a counter, not a
        wall-clock measurement),
      - per-tick spatial-hash rebuilds = 1 (no double-rebuild bugs).
    These are deterministic and survive CI runner variance.
  - **Wall-clock perf gate** (CI = trend/warning, local laptop = hard):
    - `tests/e2e/e2e_perf_budget.mjs` runs N=1000 for 1000 ticks on the documented
      machine class and asserts mean tick wall time < 16 ms. On CI the same test runs but
      only emits a warning + writes the timing to an artifact, never fails. Trend regressions
      are flagged across runs.
  - Spatial-hash cell-size tuning study lives in `devel/tune_spatial_hash.py`. If the chosen
    cell size differs from the value frozen in `src/sim_constants.ts` after M7, the study
    update triggers a forced recalibration cycle (rerun M7 acceptance gates with the new
    tuple). Per Q7, perf does not silently override epidemiology calibration.
- Exit criteria:
  - Operation-count budgets pass on every CI run.
  - On the documented machine class, the wall-clock gate hits >= 30 ticks/sec at N=1000.
  - Determinism preserved.
  - Visual confirmation that heterogeneity produces visibly varied agent behavior in Playwright
    smoke (faster vs slower walkers visible by trajectory length over a fixed interval).
  - Obvious follow-on: `docs/CHANGELOG.md`, update `docs/CODE_ARCHITECTURE.md` perf section.
- Parallel-plan ready: yes. WS-M8a (heterogeneity), WS-M8b (op-count perf budget),
  WS-M8c (wall-clock perf + spatial-hash tuning), WS-M8d (scenario plumbing for N and rate
  knobs) fan out after `AgentParams` shape is fixed in M3 and the rate types land in M6.

### M9 -- Rendering adaptation

- Depends on: M3 (positions exist), M5 (positions update continuously).
- Deliverables:
  - `src/rendering.ts` reads `passenger.position` directly; per-zone grid layout deleted.
  - CSS transition shortened (positions now update every tick rather than at zone hops); jitter
    code removed.
  - Add visual debug toggle (`?debug=1`) that overlays perception radii, steering vectors, and
    the room-graph waypoint sequence.
- Exit criteria:
  - Playwright smoke includes assertion that dot positions change smoothly tick-over-tick
    (delta below a threshold) -- a quantitative motion check, not an emergent-behavior check.
  - Manual visual inspection: agents respect walls, pass through doorways, and do not jitter
    in place. Lane formation is a qualitative observation only, not an assertion (per the
    revision: emergent phenomena are hard to assert reliably).
  - Obvious follow-on: `docs/CHANGELOG.md`.
- Parallel-plan ready: no -- single component.

### M10 -- Documentation and close-out

- Depends on: all of M0a-M9.
- Deliverables: refreshed `README.md`, `docs/CODE_ARCHITECTURE.md`, `docs/FILE_STRUCTURE.md`,
  `docs/EPI_MODEL.md`, `docs/SHIP_YAML_SPEC.md`, full `docs/CHANGELOG.md` day blocks, archive of
  this plan via `git mv` to `docs/archive/`.
- Exit criteria: every doc lists current agent model; `pytest tests/test_markdown_links.py`
  and `tests/test_readme_first_paragraph.py` pass.
- Parallel-plan ready: yes. One doc per workstream.

## Workstream breakdown

| ID | Milestone | Description | Depends on |
| --- | --- | --- | --- |
| WS-M0a | M0a | Restore `cp src/ship_schematic.svg dist/...` + `test -f` in `build_github_pages.sh` | none |
| WS-M0b | M0b | Install eslint + prettier devDeps; lock | none |
| WS-M1a | M1 | Fix `no-explicit-any` + `no-unused-vars` findings | WS-M0b |
| WS-M1b | M1 | Fix `explicit-function-return-type` + `prefer-const` + `eqeqeq` | WS-M0b |
| WS-M1c | M1 | Fix Prettier formatting | WS-M1a, WS-M1b |
| WS-M2a | M2 | `data/ship.yaml` schema + `pipeline/generate_ship_svg.py` | WS-M0a |
| WS-M2b | M2 | `build_github_pages.sh` calls generator + smoke schematic assertion | WS-M2a |
| WS-M2c | M2 | Wire generator output into `src/ship_layout.ts` consumers | WS-M2a |
| WS-M2d | M2 | Freshness pytest + `docs/SHIP_YAML_SPEC.md` | WS-M2a |
| WS-M2e | M2 | `pipeline/compare_ship_svg_bounds.py` + visual-bounds pytest + reference SVG snapshot | WS-M0a, WS-M2a |
| WS-M3a | M3 | `Passenger` + `AgentParams` types + init helper | WS-M2c |
| WS-M3b | M3 | `src/spatial_hash.ts` + unit tests | WS-M3a |
| WS-M3c | M3 | Perception helper + unit tests | WS-M3b |
| WS-M4a | M4 | Room-graph build in `src/navigation.ts` | WS-M2c |
| WS-M4b | M4 | Path planner + `nextWaypoint(agent)` + unit tests | WS-M4a |
| WS-M4c | M4 | Agent-state wiring for `path` + `pathIndex` | WS-M3a, WS-M4b |
| WS-M5a | M5 | Steering primitives in `src/steering.ts` + unit tests | WS-M3a |
| WS-M5b | M5 | Polygon clamp + wall-aware step | WS-M2c, WS-M3a |
| WS-M5c | M5 | Movement-phase integration in `src/simulation.ts` | WS-M5a, WS-M5b, WS-M4c, WS-M3c |
| WS-M5d | M5 | `src/sim_constants.ts` provisional tuple (dt, contact_radius, cell_size, perception_radius) | none |
| WS-M6a | M6 | Rate types + scenario rename + effective-R0/Rt UI labels | WS-M3a |
| WS-M6b | M6 | Per-tick rate-to-prob transitions + exposure rewrite | WS-M5c, WS-M6a |
| WS-M6c | M6 | Stats panel display + transition unit tests | WS-M6a |
| WS-M7a | M7 | `devel/seir_ode.py` deterministic integrator | WS-M6b |
| WS-M7b | M7 | `devel/calibrate_baseline.py` + e2e SEIR validation | WS-M7a |
| WS-M7c | M7 | `docs/EPI_MODEL.md` final write-up | WS-M7b |
| WS-M8a | M8 | Heterogeneous agent params | WS-M3a |
| WS-M8b | M8 | Op-count perf budget unit test | WS-M5c, WS-M3b |
| WS-M8c | M8 | Wall-clock perf e2e + spatial-hash tuning study | WS-M5c, WS-M3b |
| WS-M8d | M8 | Scenario plumbing for new knobs (N, rates, heterogeneity) | WS-M8a, WS-M6a |
| WS-M9 | M9 | Rendering adaptation | WS-M5c |
| WS-M10a | M10 | `README.md` + `docs/CODE_ARCHITECTURE.md` refresh | all prior |
| WS-M10b | M10 | `docs/FILE_STRUCTURE.md` + `docs/SHIP_YAML_SPEC.md` polish | WS-M2d |
| WS-M10c | M10 | `docs/CHANGELOG.md` rollup + plan archive | all prior |

Max parallel doers per milestone: M0a=1, M0b=1 (concurrent with M0a = 2 total), M1=2 then 1,
M2=3 after schema, M3=2-3, M4=2 then 1, M5=2 then 1, M6=3, M7=1, M8=3, M9=1, M10=3.

## Work packages

Each workstream above is a single work package, completable by one coder, resulting in at
least one patch. Sizing follows the repo's right-sized-for-one-coder convention. Dependencies
are declared by WS-ID in the table; no dependency is implied by milestone number alone.

## Acceptance criteria and gates

- **G0a (after M0a):** `./build_github_pages.sh` produces `dist/ship_schematic.svg`; the hull
  is visible on first paint via `./run_web_server.sh`; `npm run smoke` passes the
  schematic-rendered assertion.
- **G0b (after M0b):** `npm run lint` runs (findings allowed, missing-dependency error is not).
- **G1 (after M1):** `npm run lint -- --max-warnings 0` and `npx prettier --check .` exit 0.
- **G2 (after M2):** `data/ship.yaml` is the only place zone bounds are authored; regenerating
  is idempotent; freshness pytest green; `tests/test_ship_svg_visual_bounds.py` green (every
  zone's bounding-box relative error vs `data/reference/ship_schematic_pre_m2.svg` is <= 2%).
- **G3 (after M3):** Determinism stress: 100-tick position trace identical across two runs with
  the same seed; spatial-hash + perception unit tests green.
- **G4 (after M4):** Room-graph reachability check (every zone reachable from every other zone
  in the baseline ship); path planner unit tests green; replan-on-displacement test green.
- **G5 (after M5):** Zero wall crossings across 10k-tick stress; deadlock guard never trips on
  baseline scenario; steering unit tests green.
- **G6 (after M6):** SEIR/SEIRS transitions unit-tested; effective R0, effective Rt, and
  approx. herd-immunity threshold displayed live in the stats panel (labeled as calibrated
  effective equivalents, not mechanistic identities); determinism preserved.
- **G7 (after M7):** SEIR mean-field check (single-room homogeneous mixing at N=1000) matches
  the deterministic ODE peak prevalence and time-to-peak within +-10% averaged across 32
  seeds; SEIR final-size check matches `1 - exp(-R0 * (1 - S_inf))` within +-5% across the
  same 32 seeds; baseline ship effective R0 within +-10% of analytic target after calibration.
- **G8 (after M8):** Op-count budgets pass on every CI run; on the documented machine class,
  the wall-clock gate hits >= 30 ticks/sec at N=1000; heterogeneity visibly varies
  trajectories in Playwright smoke; determinism preserved.
- **G9 (after M9):** Playwright smoke passes the smooth-motion assertion (quantitative);
  agents respect walls and pass through doorways (qualitative visual check). Lane formation
  is observed where it happens, not asserted.
- **G10 (after M10):** Every doc currency check passes; plan moved to `docs/archive/`.

## Test and verification strategy

- **Fast lane (pytest + node --test):** lint and tsc gates already in place; add steering,
  spatial-hash, perception, exposure-radius unit tests under `tests/`. Keep each test < 1s.
- **Determinism stress:** small `tests/test_determinism.mjs` runs the sim twice with one seed,
  diffs the position+health trace. Catches accidental non-determinism early.
- **E2E (`tests/e2e/`):** add `e2e_calibration.sh` that runs `devel/calibrate_baseline.py` and
  asserts the +-10% / +-15% tolerance bands from G5.
- **Browser smoke:** extend `tests/playwright/smoke_app.mjs` to assert the schematic is visible
  and that passenger dots move smoothly tick-over-tick. Emergent behaviors (lane formation,
  herding, congestion) are observed during manual review; they are not assertion gates,
  consistent with the revised decision and with `docs/ARTIFICIAL_LIFE.md`.
- **Manual:** every milestone exit requires a manual `./run_web_server.sh` check until M7.

## Migration and compatibility policy

- The `ShipLayout` exported type stays compatible (existing field shapes preserved); polygon
  fields are added optionally in M2, required by M4.
- Scenario preset *names* are not renamed. Scenario *parameter* names may migrate to the new
  rate set (beta, sigma, gamma, omega, plus optional isolation_goal_rate); the migration ships with
  a documented old-name -> new-name mapping in `docs/CHANGELOG.md` and `docs/EPI_MODEL.md`.
- The deterministic-LCG-from-seed contract is preserved across the rewrite.
- Backward compatibility for hand-authored SVG is dropped at M2: after that milestone,
  `src/ship_schematic.svg` is generated, and edits to it lose to the next regeneration.
- Legacy deletion: after M3 lands, `src/ship_layout.ts` either deletes or thin-wraps
  `src/ship_layout.generated.ts`. Decision in `## Open questions and decisions needed`.

## Risk register

| ID | Risk | Trigger | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| R1 | Continuous-space sim too slow at 1000 passengers in browser | M8 perf check shows >16 ms/tick or op-count budget breached | Spatial-hash cell-size tuning; perception radius cap; cap default crowd at the largest N that meets the perf budget; document scaling limits | Sim lead |
| R2 | Calibration unstable: effective R0 sensitive to spatial-hash cell size, perception radius, or tick duration | G7 calibration sweep oscillates | All three live in `src/sim_constants.ts` (introduced in M5 as WS-M5d). M7 holds them constant during its sweep and writes the calibrated tuple back. Any later change to that file (M8 perf tuning or otherwise) forces a recalibration cycle | Sim lead |
| R3 | Generated SVG diverges visually from hand-authored | M2 visual diff exceeds 2% per-zone bounds | M2 generator output is gated behind `?yaml_geometry=1` until visual parity reached; M0a hand-authored SVG remains the default in the meantime | Geometry lead |
| R4 | Lint cleanup hides logic bugs by rewriting code rather than disabling rules | Reviewer flags a non-trivial code change behind a `prefer-const` fix | Each WS-M1 patch must touch only the rule it claims; non-trivial refactors get their own patch outside M1 | Lint lead |
| R5 | Determinism breaks (Math.random accidentally used) | G3 stress fails | Add eslint rule `no-restricted-globals: ["Math.random"]`; LCG must be threaded explicitly | Sim lead |
| R6 | Agent oscillation / deadlock per `docs/ARTIFICIAL_LIFE.md` failures | Manual or smoke catches stuck dots | Room-graph navigation in M4 + deadlock guard in M5; perturbation kick; widen `obstacleAvoid` weight | Steering lead |
| R7 | Rate parameter rename breaks scenario presets used in classroom | M6 ships without curriculum review | Add a parameter-rename note to `docs/EPI_MODEL.md`; preserve scenario *names* and document old-name -> new-name mapping in `docs/CHANGELOG.md` | Curriculum lead |
| R8 | Agent-based effective R0/Rt misinterpreted as the deterministic-model R0/Rt | UI shows the values without context; reader mistakes them for closed-form quantities | UI labels say "effective" and link to `docs/EPI_MODEL.md`; `docs/EPI_MODEL.md` opens with the caveats from `docs/SEIR_Simulation.md` about homogeneous-mixing assumptions vs spatial contact | Curriculum lead |
| R9 | Room-graph navigation produces unnatural paths (everyone funnels through the same doorway) | Visual review shows queuing artifacts | M4 v1 is BFS; switch to distance-weighted A* per Q4 if needed; consider per-edge cost penalties for currently-congested doorways as a follow-up | Steering lead |

## Rollout and release checklist

- M0a lands on `main` as a hotfix; no flag. Ship visible again.
- M0b lands on `main`; no flag. Lint findings remain.
- M1 lands on `main` per workstream; no flag.
- M2 ships the YAML generator behind `?yaml_geometry=1` until visual diff is within tolerance,
  then the flag is removed and generated SVG becomes the default. The hand-authored SVG fix from
  M0a remains the active artifact until M2's flag flip.
- M3-M9 land behind `?agent_v2=1` URL flag. Default flips to v2 after G5 + G6 + G7 + G8 + G9
  pass.
- M10 lands after the flag flip.
- Each milestone publishes its own `docs/CHANGELOG.md` entry under the appropriate category.

## Documentation close-out requirements

- `docs/CHANGELOG.md`: one day-block entry per milestone, categorized per `docs/REPO_STYLE.md`.
- `docs/CODE_ARCHITECTURE.md`: refreshed at M3 (state shape) and M7 (final shape).
- `docs/FILE_STRUCTURE.md`: refreshed at M2 (new `data/`, `pipeline/generate_ship_svg.py`) and
  M3-M5 (new `src/spatial_hash.ts`, `src/steering.ts`, `src/navigation.ts`).
- `docs/SHIP_YAML_SPEC.md`: new, added in M2.
- `README.md`: quick-start refreshed at M10 to reflect the agent model.
- This plan: `git mv` to `docs/archive/` at M10.

## Patch plan and reporting format

- Patches labeled `Patch 1`, `Patch 2`, etc., per `docs/REPO_STYLE.md`.
- Each patch is one PR-sized change, scoped to a single WS-ID where possible.
- Patch descriptions cite the WS-ID and the relevant `G<N>` acceptance gate.
- Cadence: 1-2 patches per coder per week; do not bundle unrelated WS-IDs in one patch.

## Resolved decisions

- **Build-fix scope.** M0a ships a one-line hotfix (`cp src/ship_schematic.svg dist/...` +
  `test -f`) so the ship is visible while the rest of the plan runs. The YAML generator in M2
  replaces the source of truth later. (Revised; supersedes the earlier "no M0 hotfix"
  decision.)
- **Epidemiology model.** Adopt SEIR/SEIRS per `docs/SEIR_Simulation.md` with explicit rates
  beta, sigma, gamma, omega. The agent simulation is spatial and contact-radius based, so the
  displayed R0/Rt/herd-threshold are **calibrated effective equivalents**, labeled as such in
  the UI, not direct mechanistic truths.
- **Calibration is its own milestone.** M6 owns the parameter and transition refactor; M7
  owns calibration, ODE comparison, and final-size validation. These were split because the
  combined milestone was too large to verify atomically.
- **Crowd cap.** Default target is N=1000+ passengers; M8 enforces deterministic op-count
  budgets (CI gate) plus a wall-clock budget (warning-only in CI, hard locally).
- **Social groups.** Deferred entirely. No `src/social.ts`. Heterogeneity at the individual
  agent level only.
- **Room-graph navigation.** Movement uses an explicit room-graph path planner
  (`src/navigation.ts`) computed from YAML doorways. Steering then walks the agent toward the
  next waypoint. Steering alone is not allowed to choose cross-room targets.
- **Emergent behavior is observed, not asserted.** Lane formation, herding, and congestion
  patterns may appear; tests do not gate on them. Gates are restricted to deterministic
  properties (no wall crossing, op-count budgets, ODE cross-checks).

## Design inputs (post-approval addendum)

After plan approval an outsider produced `design/ship-spec.yaml` (37 rooms,
36x20 tile grid at 28px/tile -> 1008x560 board, 15 room types, 49 wall-opening
doors, 7 health states, 16 named seeded agents) plus `design/uploads/ship_schematic.svg`
(hand-authored hull preview). These are inputs to M2 and M3, not replacements
for the approved plan.

### D1. design/ship-spec.yaml is the seed for data/ship.yaml

WS-M2a converts the design YAML into the plan's data/ship.yaml schema. Tile
(x, y, w, h) at 28 px/tile becomes pixel polygons (four CCW vertices per
axis-aligned room). All 37 rooms ship. Doors with `dir: h` become horizontal
doorway midpoints; `dir: v` become vertical doorway midpoints. The navmesh
generator emits doorway centerpoints + traversable segments per the existing
WS-M2a deliverable.

### D2. SEPIR replaces SEIR/SEIRS in M6 + M7

Health state union becomes:
`'healthy' | 'exposed' | 'pre_symptomatic' | 'symptomatic' | 'isolated' | 'recovered'`.

Mapping from design YAML labels:
- `exposed` -> E (latent, not infectious)
- `infected` (design) -> `pre_symptomatic` (P; infectious, no symptoms)
- `symptomatic` -> I (infectious, symptomatic)
- `isolated`, `recovered` unchanged
- `crew` removed as a STATE; crew distinction is role-only

SEPIR rates:
- beta_P (per-day transmission, pre-symptomatic)
- beta_I (per-day transmission, symptomatic)
- sigma = 1 / latent_period (E -> P)
- rho = 1 / pre_symptomatic_period (P -> I)
- gamma = 1 / symptomatic_period (I -> R)
- omega = 1 / immunity_period (R -> S; 0 recovers SEPIR -> SEPI special case)

Effective R0 = (beta_P / rho) + (beta_I / gamma). UI labels read "effective R0
(SEPIR)". docs/SEIR_Simulation.md remains the conceptual reference.

### D3. 16 named agents are the default scenario starter

WS-M3a seeds the baseline scenario from design YAML's `agents:` list. Each
agent gets the named id (A01..A16), display name, role (passenger / crew /
officer), initial state, and initial tile position. Random scenarios still
exist; the named-agent seed is one preset.

Resolved conflict: `name_short: "TR"` field on Tomas Reyes (A16) only.
Decision: drop `name_short`; derive 2-letter abbreviation from name at render
time. Avoids per-agent special-casing.

### D4. design/uploads/ship_schematic.svg replaces M0a SVG as M2e reference

WS-M2e copies `design/uploads/ship_schematic.svg` to
`data/reference/ship_schematic_pre_m2.svg` at the start of M2 (NOT a snapshot
of `src/ship_schematic.svg`). Per-zone bounding-box tolerance stays at 2%.
The M0a hand-authored `src/ship_schematic.svg` remains the live artifact
until M2's generator ships.

### D5. Force-field doors (no open / close state)

Design YAML doors are wall-opening tile edges (`dir: h` = horizontal wall
between row y-1 and row y at column x; `dir: v` = vertical wall between col
x-1 and col x at row y).

**Doors have no state.** No open / closed flag, no animation, no occupancy
queue, no swing geometry. Each door is a force-field-like permeable gap in
the wall: agents pass through with zero cost; obstacle-avoidance polygon
clamping treats the door segment as NOT a wall.

Implementation contract for WS-M4a (navmesh) + WS-M5b (polygon clamp):
- Room polygon walls are computed from `(x, y, w, h)` minus the door
  segments. A horizontal door at `(x, y)` punches a 1-tile-wide opening in
  the wall between rows `y-1` and `y` at column `x`. A vertical door at
  `(x, y)` punches a 1-tile opening in the wall between cols `x-1` and `x`
  at row `y`.
- Navmesh edge weight = Euclidean distance between door-segment midpoints
  (per Q4 A* decision).
- Steering's `doorwayBias` targets the door-segment midpoint as agents
  approach an outgoing edge.
- No per-door `is_open` boolean. No state machine. Closing rooms (isolation,
  bridge) happens by REMOVING the door from `design/ship-spec.yaml`, not by
  flipping a runtime flag. Re-opening = re-add door + regenerate.

Rationale: state-machine doors add a per-tick check, animation hooks, and
deadlock surface (agent queues at closed door). Force-field doors keep the
sim deterministic and remove an oscillation-failure class flagged in
`docs/ARTIFICIAL_LIFE.md`.

### Risk R10 (new)

The 16-name seed becomes part of the reproducibility contract. Renaming or
reordering the agent list breaks visual identity across scenarios. Mitigation:
treat `design/ship-spec.yaml`'s agents block as frozen until M3 lands; any
edits to names or order go through a documented changelog entry.

### Impacted plan sections (no rewrites required)

- M2 Architecture mapping: `data/ship.yaml` is derived from `design/ship-spec.yaml`.
- M3 deliverables: named-agent seed becomes the baseline scenario.
- M4 navmesh: wall-opening doors per D5.
- M6 rate types: SEPIR per D2 (beta_P, beta_I, sigma, rho, gamma, omega).
- M7 calibration: effective R0 = (beta_P / rho) + (beta_I / gamma).
- WS-M2e reference SVG: `design/uploads/ship_schematic.svg` per D4.

## Open questions and decisions needed

**Q1. Ship layout import path.**
Decision: keep `src/ship_layout.ts` as a thin re-export of `src/ship_layout.generated.ts`.
Rationale: all ship geometry and coordinates must come from `data/ship.yaml` as the single
source of truth. Keeping the existing import path reduces churn in the TypeScript code while
still preventing hand-authored layout data from surviving.

**Q2. Tick time unit.**
Decision: separate visual frame rate from simulation time. Use a fixed simulation step,
`dt = 1/240 day` per tick, equal to 6 simulated minutes. Rendering can interpolate between
ticks so passengers appear to move continuously. Do not make epidemiology rates depend on
browser frame rate.

**Q3. Wall geometry vertex convention.**
Decision: use CCW polygons for walkable room boundaries. Use explicit `is_hole: true` for
holes or blocked areas. Rationale: explicit hole metadata is easier to validate from YAML and
less fragile than relying on winding direction alone.

**Q4. Path planner cost model.**
Decision: use distance-weighted A* for v1, not BFS. Rationale: unit-edge BFS may choose
unrealistic routes through many short rooms or odd doorway chains. Distance-weighted A* is
still simple, deterministic, and better matched to physical movement.

**Q5. Isolation behavior.**
Decision: isolation should become an agent-level goal state. Rationale: isolation is not just
a health label. Once an agent enters the isolation condition, navigation should assign that
agent a goal such as the medical bay or cabin, then steering moves the agent there.

**Q6. `isolation_goal_rate`.**
Decision: do not treat `isolation_goal_rate` as a core SEIR/SEIRS rate. Rename it to something like
`clinical_isolation_probability_per_day` or `isolation_goal_rate`. It controls the probability
that an infectious agent adopts the isolation goal state. It belongs to
behavior / intervention logic, not the SEIRS disease-state model.

**Q7. Perf machine class.**
Decision: keep the documented machine class but make it secondary. The main CI gate is
deterministic operation counts. The wall-clock laptop benchmark is useful as a release sanity
check; it should not drive architecture by itself.

**Q8. Heap allocation envelope.**
Decision: use reference-relative allocation checks at first. Set a checked-in baseline and
fail only if allocation rises above 1.5x that reference. After the architecture stabilizes,
convert the worst hot paths to hard upper bounds.
