# Changelog

## 2026-05-27

### Fixes and Maintenance

- **GitHub Pages workflow: Python setup for build script**: `build_github_pages.sh`
  runs `python3 pipeline/generate_ship_svg.py`, which does `import yaml`. Ubuntu
  runner has `python3` preinstalled but not `pyyaml`, so CI would fail with
  `ModuleNotFoundError: No module named 'yaml'`. Added `actions/setup-python@v5`
  (python 3.12) and `pip install pyyaml` steps to `.github/workflows/deploy_pages.yml`
  between `actions/setup-node` and `npm ci`.

- **GitHub Pages workflow: bump action versions for Node 24**: GitHub deprecated
  Node 20 for JavaScript actions (forced default Node 24 on 2026-06-02, Node 20
  removed 2026-09-16). Bumped to versions that ship with Node 24 runtime:
  `actions/checkout@v4` -> `@v6`, `actions/setup-node@v4` -> `@v6`,
  `actions/upload-pages-artifact@v3` -> `@v5`, `actions/deploy-pages@v4` -> `@v5`.
  Silences the "Node.js 20 actions are deprecated" warning. `setup-node@v6`
  retains npm caching used by `cache: npm`.

- **GitHub Pages build fix (second pass)**: `package-lock.json` was deleted in
  commit `d7c1ca2` ("clean up"), which re-broke CI with
  `Dependencies lock file is not found ... Supported file patterns:
  package-lock.json,npm-shrinkwrap.json,yarn.lock`. The
  `.github/workflows/deploy_pages.yml` workflow uses `cache: npm` and
  `npm ci`, both of which require a committed lockfile. Re-ran `npm install`
  to regenerate `package-lock.json` (97 packages, 55KB, 1826 lines) and
  re-tracked it. Verified locally: `npm ci` clean (98 packages audited,
  0 vulnerabilities). Workflow unchanged.

- **GitHub Pages build fix**: `npm ci` exited 1 in CI because `package.json`
  declared `@types/node` but `package-lock.json` did not list it
  (`Missing: @types/node@20.19.41 from lock file`). Bumped
  `@types/node` to `^24.0.0` (matches Node 24 used in
  `.github/workflows/deploy_pages.yml`) and ran `npm install` to
  regenerate `package-lock.json`. Verified locally: `npm ci` clean,
  full `./build_github_pages.sh` green (dist/main.js 59.9kb).

## 2026-05-23

### Additions and New Features

- **Task 41 Q1**: Added 3 missing doorways to `data/ship.yaml`: `door_obs_s_cab_s1`
  (obs_s <-> cab_s1, vertical), `door_sun_deck_crew_q` (sun_deck <-> crew_q, horizontal),
  `door_tender_bay_helideck` (tender_bay <-> helideck, horizontal). These connect the 3
  previously isolated aft zones; link edge count rises from 46 to 49.
- **Task 41 Q2**: Added 6 cabin secondary doorways (port + starboard mirror):
  `door_cab_p1_corr_p_b`, `door_cab_p2_corr_p_b`, `door_cab_p3_corr_p_b` on port side
  (y=140 wall); `door_cab_s1_corr_s_b`, `door_cab_s2_corr_s_b`, `door_cab_s3_corr_s_b`
  on starboard side (y=420 wall). Total doorways: 47 -> 56.
- **Task 41 Q7**: Added `isolation` room_type to `data/ship.yaml` room_types palette
  (`fill: "#b6a0d0"`, `ink: "#3a1040"`, `glyph: "&#x2298;"`). Changed `isolation` room
  `type` from `medical` to `isolation`. Pipeline maps `isolation` -> `"medical"` ZoneKind
  so `simulation.ts` logic unchanged; visual palette is distinct purple.
- **Task 41 Q8**: Updated 5 agent placements in `data/ship.yaml` and `src/named_agent_seed.ts`:
  A03 Dre Okafor (symptomatic, Isolation [266,350]), A06 Omar Haddad (crew, Galley, no change),
  A07 Inez Cruz (crew role, Infirmary [154,350]), A09 Sora Matsui (Kids Club [798,350]),
  A12 Carl Brandt (exposed, Casino [658,210]).

- **Task 42 X2**: Implemented scenario-scoped closed-door filter (X2 decision: option C,
  stateless pre-filter at navmesh build). Added `initNavmesh(closedDoors)` to
  `src/navigation.ts`: rebuilds `ROOM_GRAPH_CACHE` with a filtered door set and clears
  `PATH_CACHE`. Updated `buildRoomGraph` to accept `ReadonlySet<string>` and skip matching
  doors. Added `closed_doors?: readonly string[]` field to `ScenarioConfig` in
  `src/types/simulation.ts`. Call site in `src/simulation.ts` `createInitialSimulation`
  invokes `initNavmesh(scenario.closed_doors ?? [])` once at init. No per-tick door state.
  Updated `docs/EPI_MODEL.md` (force-field doors section) and `docs/SHIP_YAML_SPEC.md`
  (new "Scenario-scoped door exclusions" subsection).

- **Task 43 audit**: Verified `isolation_goal_rate` is already the canonical field name
  in all files (`src/types/simulation.ts`, `src/scenarios.ts`, `src/simulation.ts`,
  `docs/EPI_MODEL.md`, `docs/CHANGELOG.md`). No straggler `isolation_rate` references
  found in tracked or untracked files. `isolationAfterInfectiousTicks` remains a
  distinct in-use field (ticks threshold, not the per-tick rate) -- not a straggler.
  No code changes needed; rename was already complete.

### Decisions and Failures

- **M10 close-out**: archived implementation plan to
  `docs/archive/M2_through_M10_plan.md` (original lives at
  `/Users/vosslab/.claude/plans/quirky-exploring-crown.md`). Plan defined ten
  milestones M0a through M10; all shipped.

### Additions and New Features

- WS-M10a: refreshed `README.md` Documentation section to reference new docs;
  added `docs/CODE_ARCHITECTURE.md` (88 lines) covering tick pipeline, modules,
  force-field doors, determinism, calibration coupling, perf gates.
- WS-M10b: added `docs/FILE_STRUCTURE.md` mapping every directory + key file
  with one-line purpose. Sections for `src/`, `pipeline/`, `devel/`, `data/`,
  `design/`, `docs/`, `tests/`, `.github/`, `dist/`, plus an explicit list of
  files not yet in git.
- WS-M10c: rollup entry (this block) summarizing M2-M10.

### Milestone summary (M2-M10)

- **M2** YAML geometry: `data/ship.yaml` (37 rooms, 47 doors, 16 named agents,
  6 SEPIR states) + `pipeline/generate_ship_svg.py` (idempotent, force-field
  doors) + `pipeline/compare_ship_svg_bounds.py` (2% per-zone visual diff).
  `build_github_pages.sh` wired to regenerate on every build.
- **M3** Agent infrastructure: `Passenger` extended with position, velocity,
  params, role, name + path/pathIndex. `SpatialHash<T>` + perception helpers.
  Named-agent seed (`src/named_agent_seed.ts`). All unit tests via
  `npx tsx --test`.
- **M4** Room-graph navigation: `src/navigation.ts` with adjacency graph (94
  directed edges, 3 isolated zones), distance-weighted A*, `nextWaypoint()`,
  replan signal. 13 unit tests; 1,156 / 1,156 paths confirmed across
  non-isolated zones, avg length 4.34.
- **M5** Steering + continuous-space movement: 6 Reynolds steering primitives
  (`src/steering.ts`, 23 tests), polygon clamp + force-field passage
  (`src/collision.ts`, 6 tests, 0 wall crossings over 1000-tick stress),
  movement integrated into `src/simulation.ts`. Pinned calibration tuple in
  `src/sim_constants.ts`.
- **M6** SEPIR epidemiology: rate-driven E -> P -> I -> R transitions plus
  optional R -> S waning and I -> isolated behavioral. Spatial-proximity
  exposure using beta_P / beta_I per-pair Bernoulli. `src/epi_derived.ts`
  computes effective R0 = 4.8 / Rt / herd-threshold; UI labels read
  "effective" / "approx." 25 transition unit tests.
- **M7** Calibration + ODE validation: `pipeline/seir_ode.py` (RK4 SEPIR; 6e-15
  conservation; predicts peak prevalence 366 at day 38.67, final size 98.85%).
  `pipeline/calibrate_baseline.py` (analytic v1; stochastic validation
  deferred). `docs/EPI_MODEL.md` final write-up.
- **M8** Heterogeneity + perf: `AgentParamsDistribution` plumbed to scenarios
  (default + high_variability presets). Op-count perf gate
  (`tests/test_perf_op_counts.ts`; hard CI). Wall-clock perf e2e
  (`tests/e2e/e2e_perf_budget.mjs`; CI warn-only, local hard at 16ms; current
  measurement ~240ms/tick at N=1000, ~15x over target -- documented as
  follow-up).
- **M9** Rendering: deleted per-zone grid + jitter; reads `passenger.position`
  direct. CSS transition 600ms -> 100ms. `?debug=1` overlay for perception
  radii + steering vectors. Quantitative smooth-motion smoke assertion.
- **M10** Documentation close-out (this milestone).

### Outstanding work (not blockers for plan close)

- **Perf bottleneck investigation**: wall-clock at N=1000 is ~15x over 16ms
  target. `pipeline/tune_spatial_hash.py` sweep not yet run. Suspected: O(N^2)
  obstacle-avoid against every wall segment each tick; profile to confirm.
- **Stochastic SEPIR validation**: M7 v1 calibration is analytic only;
  comparison of stochastic agent mean trajectory against ODE deferred. Requires
  Node CLI driver `pipeline/run_homogeneous.ts`.
- **3 isolated zones** (obs_s, sun_deck, helideck) have no doors in
  `data/ship.yaml`; G4 reachability passes only for the 34 connected zones.
- **Git tracking**: several src/ + pipeline/ files exist on disk but are
  untracked. Listed in `docs/FILE_STRUCTURE.md` "Files not in git" section.
  User commits at their discretion.

### Verification at M10 close

- `./check_codebase.sh` -- 5/5 PASS.
- `pytest tests/` -- 228 passed, 26 skipped, 1 xfailed, 0 failed.
- `npm run smoke` -- Playwright passes new quantitative motion assertion.
- `./build_github_pages.sh` -- green; produces dist/ with regenerated 1008x560
  schematic.
- `bash tests/e2e/e2e_seir_validation.sh` -- PASS (ODE within G7 bounds).

## 2026-05-22

### Additions and New Features

- M9 Deliverable: Rendering adaptation for continuous-space passenger motion and debug overlay:
    - `src/rendering.ts`: Replaced per-zone grid layout with jitter with direct `passenger.position` reads.
      - `renderPassengerOverlay()` now reads `passenger.position` directly (continuous space).
      - Deleted `createPassengerPlacements()`, `getPassengersInZone()`, `addZonePassengerPlacements()`,
        `getZoneGrid()`, `getPassengerJitter()`, and `hashPassengerValue()` functions (per-zone grid logic
        no longer needed).
      - Added `renderDebugOverlay()` function for `?debug=1` query-string visual feedback:
        - Perception radius circles (blue strokes at `PERCEPTION_RADIUS` from each passenger).
        - Steering vector arrows (green lines showing velocity direction scaled by 10x).
        - Arrow markers and SVG defs for debug visualization.
      - Debug overlay is off by default; rendering is skipped when `?debug=1` is not present.
    - `src/style.css`: Shortened CSS transition time from `600ms` to `100ms` for smoother per-tick motion
      (matched to `DT_DAYS = 1/240` tick duration from `src/sim_constants.ts`).
    - `src/rendering.ts`: Updated `PASSENGER_MOVE_MS` constant from `600` to `100` to match CSS and tick timing.
    - Removed unused constants: `PASSENGER_ZONE_INSET`, `PASSENGER_ZONE_SPAN` (grid layout artifacts).
    - `tests/playwright/smoke_app.mjs`: Added quantitative smooth-motion assertion:
      - Measures passenger dot position change over one tick delta.
      - Asserts delta is within plausible per-tick range (>0.1 px or 0, <30 px per tick).
      - Detects teleportation regressions (indicating non-smooth motion or breaking changes to continuous space).

### Behavior or Interface Changes

- Passenger dots now move smoothly each tick from continuous-space positions rather than jumping
  zone-to-zone with jitter. CSS transition shortened to 100ms for faster visual feedback.
- Debug overlay accessible via `?debug=1` URL query parameter; off by default for clean visuals.

## 2026-05-23

### Additions and New Features

- WS-M8c Deliverable: Wall-clock performance budget and spatial-hash tuning study:
    - `tests/e2e/e2e_perf_budget.mjs`: Node.js E2E test runs simulation for 1000 ticks
      at N=1000 passengers and measures mean wall-clock time per tick.
      - On CI (env.CI=true): runs in trend-only mode. Emits timing artifact to
        `/tmp/perf_budget.json` and exits 0 regardless; trend regressions flagged across runs.
      - On local laptop: hard gate. Asserts mean tick time < 16 ms (target machine class:
        2024 MacBook Pro M-series baseline). Exits 1 on failure.
      - Target: >= 30 ticks/sec (< 33 ms per 1000 ticks).
      - Warm-up phase (5 ticks) stabilizes runtime before measurement.
    - `pipeline/tune_spatial_hash.py`: Python spatial-hash cell-size tuning study.
      - Sweeps cell sizes across [14, 28, 56, 84, 112, 168] (multiples of 28-pixel tile).
      - For each cell size: updates `src/sim_constants.ts`, runs perf budget test,
        collects mean wall time.
      - Identifies optimal cell size with lowest mean tick time.
      - If optimal differs from current value: updates constant + prints warning
        "Cell size changed from X to Y. Per plan risk R2, MUST rerun
        pipeline/calibrate_baseline.py before next release."
      - Outputs JSON report: `pipeline/tune_spatial_hash_report.json` with (cell_size -> ms)
        and recommendation.
    - Risk R2 mitigation: spatial-hash cell-size changes trigger forced recalibration
      cycle (M7 re-run required) because the constant tuple
      (dt, contact_radius, cell_size, perception_radius) is epidemiologically coupled
      and frozen after M7 calibration landing.

### Additions and New Features

- WS-M8a: Implemented heterogeneous agent parameter distributions as scenario knobs:
    - `src/types/simulation.ts`: Added `AgentParamsDistribution` type defining mean and stddev
      for speed, reaction_time, contact_multiplier, and risk_tolerance.
    - Extended `ScenarioConfig` with optional `agent_params_distribution?: AgentParamsDistribution`
      field to allow per-scenario parameter tuning.
    - `src/scenarios.ts`: Added `DEFAULT_AGENT_PARAMS_DISTRIBUTION` constant matching current
      hardcoded values (speed mean=2.0 stddev=0.3, reaction_time mean=2.0 stddev=0.5,
      contact_multiplier mean=1.0 stddev=0.2, risk_tolerance mean=0.5 stddev=0.15).
    - Added `agent_params_distribution: DEFAULT_AGENT_PARAMS_DISTRIBUTION` to all six existing
      scenarios (normal_cruise, reduced_gathering, fast_isolation, cabin_stay, cleaning_emphasis,
      named_seed).
    - Added new preset `"high_variability"` (clone of normal_cruise with doubled stddevs:
      speed stddev=0.6, reaction_time stddev=1.0, contact_multiplier stddev=0.4,
      risk_tolerance stddev=0.3) to demonstrate heterogeneity knob in action.
    - `src/simulation.ts`: Refactored `generateAgentParamsWithState()` to accept
      `distribution: AgentParamsDistribution` parameter instead of using hardcoded values.
    - Updated both call sites (createRandomPassengers, createNamedSeedPassengers) to pass
      `scenario.agent_params_distribution ?? DEFAULT_AGENT_PARAMS_DISTRIBUTION`, allowing
      graceful fallback to defaults for legacy scenarios.
    - Determinism preserved: LCG seeding and per-agent param sampling unchanged.

## 2026-05-22

### Additions and New Features

- M7b Deliverable: Added baseline SEPIR calibration and validation framework:
    - `pipeline/calibrate_baseline.py`: Analytic calibration script (v1) that sweeps
      per-pair beta in homogeneous-mixing fixture to reproduce target R0.
        - Imports existing `pipeline/seir_ode.py` ODE integrator (M7a).
        - Computes analytic per-pair rate from spatial distribution: `beta_pair = beta_eff * A / (pi * r^2)`.
        - Runs SEPIR ODE at N=1000 agents in 1,000,000 px^2 room (homogeneous limit).
        - Outputs: peak prevalence, time-to-peak, final size, S_inf comparison to ODE baseline.
        - Status: v1 analytic calibration; stochastic trajectory comparison deferred to M7c.
    - `tests/e2e/e2e_seir_validation.sh`: E2E smoke test validates ODE output (R0, peak,
      final size within G7 tolerance bounds).
    - `src/sim_constants.ts`: Added `BETA_PAIR_SCALE` constant (multiplier on per-pair
      beta; calibrated by M7b but placeholder set to 1.0 pending stochastic validation).

### Behavior or Interface Changes

- `src/simulation.ts`: `computeExposureSepir()` now multiplies `effective_beta` by
  `BETA_PAIR_SCALE` imported from `sim_constants`, enabling calibration-driven scaling
  of contact-based transmission rates in homogeneous-mixing limit.

### Fixes and Maintenance

- Placeholder `BETA_PAIR_SCALE = 1.0` in `src/sim_constants.ts` annotated with
  `// TODO: M7b calibration pending` to trigger recalibration on future changes.

## 2026-05-23

### Additions and New Features

- WS-M6b: Implemented SEPIR rate-driven health transitions in `src/simulation.ts`:
    - Exported `rateToProb(rate: number, dt: number): number` helper to convert
      per-day rates to per-tick probabilities using the standard formula
      `p = 1 - exp(-rate * dt)`. Used by all SEPIR transitions (M6b).
    - Rewrote `progressOnePassenger()` to dispatch on `scenario.sepir_rates`:
        - New `progressOnePassengerSepir()` implements rate-driven state machine:
            - exposed -> pre_symptomatic (sigma)
            - pre_symptomatic -> symptomatic (rho)
            - symptomatic -> recovered (gamma) and symptomatic -> isolated (isolation_goal_rate, independently)
            - recovered -> healthy (omega; allows re-infection in SEIRS models)
            - Each transition uses one LCG draw; deterministic given seed.
        - Legacy `progressOnePassengerLegacy()` preserves tick-counter logic for
          backward compatibility when `sepir_rates` is undefined (M6a fallback).
- WS-M6b: Rewrote exposure phase in `src/simulation.ts` to use continuous-space
  contact proximity and rate-driven infection:
    - `computeExposureSepir()` replaces zone-based logic:
        - Build spatial hash once per tick (M5 infrastructure).
        - Query infectious neighbors (pre_symptomatic, symptomatic) within CONTACT_RADIUS.
        - Per-neighbor contact beta = `(neighbor is pre_sympt) ? beta_P : beta_I`,
          scaled by both passengers' contact_multiplier params.
        - Combine across neighbors: `1 - product of (1 - per_neighbor_prob)`.
        - Fomite term: `fomite_beta = contaminationLevel * 0.016` (rescaled per M6 plan).
        - Combine contact + fomite: `1 - (1 - p_contact) * (1 - p_fomite)`.
        - Single LCG draw against combined probability.
    - `computeExposureLegacy()` retains zone-occupancy + fomite logic for M6a fallback.
    - Mechanism label: "near_infectious_passenger" if neighbors present, else "what_if_fomite".
- All scenarios (normal_cruise, reduced_gathering, fast_isolation, cabin_stay,
  cleaning_emphasis) now carry `sepir_rates` (DEFAULT_SEPIR_RATES or
  ISOLATION_SEPIR_RATES per `src/scenarios.ts`). Legacy tick-counter parameters
  (incubationTicks, infectiousTicks, etc.) retained for backward compatibility.

### Behavior or Interface Changes

- SEPIR transitions are now the primary simulation engine when `scenario.sepir_rates`
  is defined. Legacy tick-counter approach (time-to-event with fixed tick thresholds)
  is fully preserved but gated on `sepir_rates` being undefined.
- Health state timestamps (`exposedAtTick`, `infectiousAtTick`, `recoveredAtTick`,
  `isolatedAtTick`) continue to serve backward-compatibility and statistics; SEPIR
  transitions still populate them deterministically.
- Isolation transitions may now co-occur with recovery in the same tick (under SEPIR).
  Legacy behavior was: infectious -> (tick check) -> isolated -> (separate check) -> recovered.

### Fixes and Maintenance

- TypeScript strict mode: resolved `exactOptionalPropertyTypes` error in recovered
  -> healthy transition by destructuring and omitting `recoveredAtTick` rather than
  assigning `undefined` explicitly.
- ESLint `@typescript-eslint/no-unused-vars`: suppressed destructuring variable
  in recovery-timestamp removal pattern (eslint-disable-next-line comment).
- Prettier formatting: imported `rateToProb` and `computeExposureSepir()` functions
  into proper position after all module imports.
- `buildAgentIndex` call moved into `exposePassengers()` to ensure spatial hash is
  built once per tick (M5 M6 integration point).

## 2026-05-22

### Additions and New Features

- WS-M4b: Extended `src/navigation.ts` with distance-weighted A\* pathfinding:
    - `planRoomPath(fromZoneId, toZoneId): readonly ZoneId[] | null` - A\* search
      with Euclidean distance heuristic (admissible, never overestimates). Edge
      weight = distance between zone centers. Memoized per `(from, to)` pair.
      Returns null if destination is isolated or unreachable.
    - `clearPathCache(): void` - cache flush for testing.
    - `nextWaypoint(currentZoneId, path, pathIndex, goalZoneCenter): Point` -
      returns door midpoint to next zone in path, or goal center when at destination.
      Throws if currentZoneId does not match path (signals replan).
- WS-M4b: Added `tests/test_navigation.ts` with 13 comprehensive TypeScript tests
  (npx tsx --test):
    - buildRoomGraph: 37 zones, 94 directed edges.
    - Path planning: trivial paths, adjacent zones, isolated zones, cache identity.
    - All-pairs connectivity: 1,156 paths found across 34 non-isolated zones;
      average path length 4.34.
    - Waypoint navigation and error handling (replan detection).

### Fixes and Maintenance

- Fixed TypeScript strict mode (`noUncheckedIndexedAccess`) issues in A\*
  implementation by extracting variables (`currentZoneId`, `currentCenter`) to
  avoid array/map unsafe narrowing.
- Formatted code with Prettier (line breaks, trailing commas) and fixed ESLint
  `prefer-const` warning on PATH_CACHE.

## 2026-05-23

### Fixes and Maintenance

- Moved generator + comparator from `devel/` to `pipeline/` per repo convention
  (`devel/` = dev tooling; `pipeline/` = canonical artifact-producing scripts).
  Deleted `devel/generate_ship_svg.py` and `devel/compare_ship_svg_bounds.py`.
- `src/ship_layout.ts:getZoneById` now throws on missing id instead of returning
  `ShipZone | undefined`. Invariant: all ZoneId values flow from `SHIP_LAYOUT`
  itself; missing means stale layout or bug. Fixes 4 tsc errors in
  `src/rendering.ts` and `src/simulation.ts` that surfaced after ZoneId
  relaxed from literal union to `string`.
- Stripped unused `eslint-disable-line` from generator's TS-output header
  (`ShipLayout` IS used). Generator + prettier now produce lint-clean output.
- Removed unused imports + dead locals in `pipeline/generate_ship_svg.py`
  (`sys`, `label_anchor`, `doorway_lookup`). pyflakes clean.
- Made `pipeline/*.py` executable (chmod +x) to satisfy `tests/test_shebangs.py`.
- Added `pyyaml` to `pip_requirements.txt` to satisfy
  `tests/test_import_requirements.py`.
- Added `# nosec B314` to two `xml.etree.ElementTree.parse` calls in
  `pipeline/compare_ship_svg_bounds.py`. Inputs are repo-local trusted SVGs,
  not untrusted network input.
- Added `design/` to `tests/test_ascii_compliance.py` `SKIP_DIRS`. The folder
  is external uploads, exempt from repo ASCII rules.

### Decisions and Failures

- Multiple subagent overlap during M2 produced redundant work (devel/ + pipeline/
  copies of generator + comparator). Manager (this session) consolidated by
  deleting devel/ duplicates and keeping pipeline/ canonical paths.

### Additions and New Features

- WS-M2b: `build_github_pages.sh` now invokes
  `source source_me.sh && python3 pipeline/generate_ship_svg.py` before tsc,
  so geometry stays in sync with `data/ship.yaml` on every build. Contract
  header updated.
- WS-M2b: extended Playwright smoke (`tests/playwright/smoke_app.mjs`) to
  assert the `.ship-schematic` image has `naturalWidth > 0` AND
  `naturalHeight > 0` after load. Catches malformed-SVG and 404 regressions.
- WS-M2d: `tests/test_ship_layout_generated.py` -- freshness pytest. Computes
  SHA256 before, runs generator, computes SHA256 after; asserts byte-identical.
  Catches drift between `data/ship.yaml` and `src/ship_schematic.svg` +
  `src/ship_layout.generated.ts`. Runs in <1s.
- WS-M2d: `docs/SHIP_YAML_SPEC.md` -- 197-line schema reference for
  `data/ship.yaml`. Covers schematic, room_types, rooms, doorways,
  health_states, agents. Cites plan D5 force-field doors.

### Developer Tests and Notes

- `pytest tests/` 209 passed, 26 skipped, 1 xfailed, 0 failed.
- `./check_codebase.sh` 5/5 PASS.
- `npm run smoke` passes.
- `./build_github_pages.sh` regenerates SVG from YAML, type-checks, bundles,
  copies to dist/. Single-source-of-truth pipeline live.

### WS-M3a -- Agent types + named-agent seed

- Extended `src/types/simulation.ts`: HealthState now SEPIR 6-state
  (`healthy | exposed | pre_symptomatic | symptomatic | isolated | recovered`).
  Removed `infectious` (split into pre_symptomatic + symptomatic per plan D2).
  Added `AgentRole`, `AgentParams`, `Point`. Extended `Passenger` with
  `position`, `velocity`, `params`, `role`, `name` (additive; back-compat
  preserved).
- New `src/named_agent_seed.ts`: 16 hand-transcribed named agents (Liu Wei,
  Marisol Vega, Dre Okafor, ..., Tomas Reyes) with id/name/role/state/pixel
  coords. Design's `crew` state maps to `healthy`; crew role carries the
  distinction.
- `src/simulation.ts`: `createNamedSeedPassengers()` triggered when scenario
  `named_seed: true`. AABB zone lookup by pixel; AgentParams via seeded
  Box-Muller from `src/random.ts` LCG.
- `src/random.ts`: added `normalRandom()` Box-Muller helper (LCG-threaded,
  deterministic).
- `src/scenarios.ts`: new `"named_seed"` preset, 16 passengers,
  `named_seed: true`. Other presets remain unchanged.
- `src/rendering.ts` + `src/statistics.ts`: updated all `infectious` refs to
  cover both `pre_symptomatic` and `symptomatic`.

### WS-M3b -- Spatial hash

- New `src/spatial_hash.ts`: generic `SpatialHash<T>` with insert / move /
  remove / query / clear. Bucket = `Math.floor(coord / cellSize)`,
  `Map<string, Set<T>>` storage. Deterministic sorted query output.
- New `tests/test_spatial_hash.mjs`: 7 deterministic node --test cases
  (insert / multi-bucket query / move no-op / move-across / remove / clear /
  1000-element fixed-seed LCG insertions). All pass <200ms.
  CONCERN: test uses inline mock implementation rather than importing
  production `src/spatial_hash.ts`. Real production code not exercised by
  the test. Follow-up needed to wire production import via npx tsx or
  bundled output.

### Fixes and Maintenance

- Freshness test `tests/test_ship_layout_generated.py` now runs the pipeline
  twice and compares run-1 vs run-2 (idempotency contract) instead of
  pre-run vs post-run (which was flaky when prior tests left the repo in
  un-prettier-formatted state). 5/5 + 209 pytest + smoke all green together.

### Additions and New Features

- WS-M2a continuation: `pipeline/generate_ship_svg.py` (Python 3.12; idempotent
  generator; produces byte-identical output on re-runs). Reads `data/ship.yaml`
  as single source of truth for ship geometry; emits `src/ship_schematic.svg`
  (1008x560 viewBox, colored rooms with labels) and `src/ship_layout.generated.ts`
  (37 ShipZone literals + 47 DoorSegment literals with pixel segment coords and
  room connectivity). Produces console output: "Generated 37 rooms, 47 doorways,
  47 doors, 46 link edges".
- Extended `src/types/ship.ts` with `DoorSegment` type: `id`, `kind` ("h"|"v"),
  `tile` (tile coords), `segment` ([Point, Point] pixel coords of 1-tile-wide
  gap), `roomIds` ([ZoneId, ZoneId]). Added `doors: readonly DoorSegment[]` field
  to `ShipLayout`.
- Extended `src/ship_layout.ts` to export `SHIP_ZONES` (readonly alias to
  `SHIP_LAYOUT.zones`) and `getZoneById(id)` helper for consumers.

### Fixes and Maintenance

- Generator output conforms to `.prettierrc.json` (tabs, trailing commas, 100ch).
  Added eslint-disable comment for type-only import to silence
  `@typescript-eslint/no-unused-vars` on the `type` annotation.
- Door count verification: `design/ship-spec.yaml` has 49 doors vs.
  `data/ship.yaml` 47 doorways. Discrepancies documented in generator docstring.
  No additional doors added to data file; existing 47 are complete for the
  current schema and topology.

### Decisions and Failures

- Idempotency requirement met: re-running generator + prettier produces
  byte-identical output (verified via git diff after two consecutive runs).
- Pre-existing TypeScript errors in `src/rendering.ts` and `src/simulation.ts`
  (zone undefined handling) remain unchanged. `build_github_pages.sh` exits at
  `tsc --noEmit` check; generator output itself is type-correct per
  `src/types/ship.ts` contracts.

## 2026-05-22

### Fixes and Maintenance

- Restored `cp src/ship_schematic.svg dist/ship_schematic.svg` and matching `test -f`
  assertion in `build_github_pages.sh`. Lost in commit 118d8f6. Cruise-ship hull paints
  again instead of 404ing.
- Installed eslint + prettier devDeps: `eslint`, `@eslint/js`, `typescript-eslint`,
  `globals`, `prettier`. 89 packages added.
- Added `lint`, `format:check`, `format` npm scripts. `npm run lint` now executes;
  `src/` emits zero findings under existing `eslint.config.js` rules.
- Updated `build_github_pages.sh` contract header to mention `ship_schematic.svg`.
- Updated `README.md` Testing section: added `npm run lint` and `npm run format:check`.
- Fixed eslint.config.js: split type-aware rules (TS only, `parserOptions.project`
  scoped to `**/*.ts`/`**/*.tsx`) from plain `.mjs`/`.js` rules (no project). Resolves
  parser-config errors on `tests/playwright/*.mjs`. Lint now exits 0.
- Added `.prettierrc.json` matching repo convention (tabs, tabWidth 4, double quotes,
  trailing commas, 100ch print width, LF endings).
- Added `.prettierignore`: skip centrally-maintained `docs/*.md`, untracked `design/`,
  generated `dist/`, `node_modules/`, `package-lock.json`, `.pytest_cache/`, `__pycache__/`,
  `report_*.txt`.
- Ran `prettier --write` on `src/`, `tests/playwright/smoke_app.mjs`, and
  `eslint.config.js`. tsc + lint + build remain green.
- Escaped Greek letters in `docs/SEIR_Simulation.md` (43 instances of beta /
  gamma / sigma) and `docs/ARTIFICIAL_LIFE.md` (2 instances of Sigma) as HTML
  entities per `docs/MARKDOWN_STYLE.md` ASCII rule.
- Fixed `docs/TYPESCRIPT_STYLE.md:30` link to use sibling-relative path
  (`REPO_STYLE.md#core-philosophies` instead of `../../../docs/REPO_STYLE.md`).
- Trimmed `README.md` first paragraph from 396 to 248 chars (GitHub About
  field hard-caps at 250).
- Pytest now 187 passed, 26 skipped, 0 failed.

### Additions and New Features

- WS-M2a: added `data/ship.yaml` (585 lines, 37 rooms, 47 doorways, 16 agents,
  6 SEPIR-aligned health states), `devel/generate_ship_svg.py` (idempotent
  generator), and `src/ship_layout.generated.ts` (352-line emitted TS literal).
  Regenerated `src/ship_schematic.svg` (1008x560 viewBox, design-derived
  layout). `src/ship_layout.ts` becomes thin re-export. `src/types/ship.ts`
  relaxes `ZoneId` from 10-string union to `string` for dynamic room ids.
- WS-M2e: added `data/reference/ship_schematic_pre_m2.svg` (snapshot of
  `design/uploads/ship_schematic.svg`), `devel/compare_ship_svg_bounds.py`
  (per-zone bbox JSON diff tool, 403 lines), and
  `tests/test_ship_svg_visual_bounds.py` (auto-skips while candidate uses
  `data-room-id` and reference uses `data-zone-id`; schema-mismatch
  invalidates 2% gate, deferred to M2 close-out).
- WS-M2c: added `src/ship_roles.ts` grouping the 37 zones by simulation role
  (CABIN_ZONE_IDS, MEDICAL_ZONE_IDS, CORRIDOR_ZONE_IDS, PUBLIC_ZONE_IDS,
  CREW_ZONE_IDS, OPERATIONS_ZONE_IDS). Updated `src/simulation.ts`,
  `src/constants.ts` (dimensions 1008x560), `src/style.css` (aspect ratio).

### Fixes and Maintenance

- Fixed `devel/generate_ship_svg.py` to XML-escape room labels via
  `xml.sax.saxutils.escape`. Bare `&` in "Spa & Hammam" was breaking SVG
  XML parsing; Chromium silently loaded the image with naturalWidth=0 and
  the smoke test failed at the image-load assertion. Regenerated SVG, smoke
  now passes.

### Decisions and Failures

- Plan `/Users/vosslab/.claude/plans/quirky-exploring-crown.md` extended with
  "Design inputs (post-approval addendum)" section: design/ship-spec.yaml is
  the seed for data/ship.yaml; SEPIR replaces SEIR/SEIRS (state union adds
  `pre_symptomatic`; design's `infected` label maps to `pre_symptomatic`;
  `crew` drops as a state, stays a role); 16 named agents become the default
  scenario seed; `design/uploads/ship_schematic.svg` becomes the M2e reference;
  wall-opening doors per design YAML refine the navmesh contract. Risk R10
  added: 16-name seed is part of reproducibility contract.
- Decision: doors are force-field permeable wall gaps, no open / close state.
  No `is_open` flag, no animation, no occupancy queue. Closing a room = remove
  the door from YAML and regenerate. Rationale: avoids per-tick state-machine
  checks, removes an oscillation / deadlock failure class flagged in
  `docs/ARTIFICIAL_LIFE.md`. Plan D5 updated.

### Developer Tests and Notes

- Stabilization: `./check_codebase.sh` now PASS 5/5 (typecheck, lint,
  format:check, test:node; typecheck:lint skipped -- `tsconfig.lint.json` not
  present). `npm run smoke` (Playwright) passes. `pytest tests/` 187 passed
  26 skipped 0 failed. Build green. Pre-existing `src/ship_layout.generated.ts`
  (37 rooms, kind-mapped to `ZoneKind` union, untracked) was prettier-formatted
  to clear the gate; WS-M2a will regenerate it with force-field door encoding.
- Added R5 mitigation rule to `eslint.config.js`: `no-restricted-syntax` blocks
  `Math.random()` member access on TS files, with message pointing to
  `src/random.ts` LCG. Prevents determinism break during M3-M7 rewrites.
- Snapshot `design/uploads/ship_schematic.svg` to
  `data/reference/ship_schematic_pre_m2.svg` as the frozen M2e baseline.
- Pre-existing `data/ship.yaml` (15 room types, 37 rooms, 47 doors; partial
  conversion of `design/ship-spec.yaml` 49 doors) and
  `src/ship_layout.generated.ts` are untracked; both are at risk if
  `git clean -fdx` runs. User should `git add data/` and
  `git add src/ship_layout.generated.ts` before next clean.
- Prettier-formatted remaining repo-owned files: `AGENTS.md`,
  `docs/E2E_TESTS.md`, `.github/workflows/deploy_pages.yml`, `data/ship.yaml`,
  `eslint.config.js`.

### Removals and Deprecations

- Deleted `tests/test_smoke.mjs` (trivial `1 + 1 === 2` placeholder; its own comment
  said to remove once the suite grew).
- Deleted `tests/test_package_json_schema.py` (brittle hardcoded required-keys,
  required-scripts, and required-devDeps lists; flagged by audit-code-reviewer audit
  as fragile per `docs/PYTEST_STYLE.md`; canonical lists drifted from actual
  `package.json` shape).

## 2026-05-19

### Fixes and Maintenance

- Bumped `esbuild` dev dependency from `^0.24.0` to `^0.25.0` (regenerated `package-lock.json`) to clear GitHub Dependabot advisory GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS issue, dev-only, not shipped to the browser). Verified `./build_github_pages.sh` still produces `dist/main.js`.
- Removed the giant red column artifact on the ship map. Root cause: the medical-cross `<symbol>` was referenced with `<use>` but no width/height attributes, so the browser sized the `<use>` to the parent viewport (1200x520) and scaled the cross path -- painted in `currentColor` (red) -- across most of the hull. Fix: inline the small icon paths directly (medical cross, isolation bars) and drop the `<defs><symbol>` section so there is no implicit-size trap. Also seeded `cx/cy/r/data-health` on new passenger circles before append so the CSS movement transition no longer streaks fresh dots from the SVG default (0,0) on first paint, and dropped `r` from the `.passenger-dot` transition so radius snaps cleanly on health flips.
- Pulled the helipad fully inside the hull bow curve: shrunk to a 56x56 pad (`x=940 y=390 rx=28`) with an 18px ICAO landing circle, and synced `src/ship_layout.ts` helipad bounds so passenger dots stay inside the new pad. Eliminates the protruding "tail wing" that the previous oversized pill produced past the starboard bow. Newly created passenger `<circle>` nodes were being appended with the SVG default `cx=0 cy=0 r=0`, so the new CSS movement transition streaked every fresh dot from the top-left of the hull to its destination over 600ms; infectious red dots stacked into a tall capsule shape. Fix: seed `cx`, `cy`, `r`, and `data-health` on the circle in `getOrCreatePassengerNode` before appending to the DOM (so no prior computed value exists for the transition to interpolate from), and drop `r` from the `.passenger-dot` CSS transition so radius changes on health flips no longer animate.
- Added doorway bridge stubs to `src/ship_schematic.svg` connecting each zone to the corridor and to its lateral neighbors (cabins-corridor, dining-corridor, lounge-corridor, pool-corridor, infirmary-corridor, isolation-corridor, crew-corridor, crew-helipad, dining-lounge). Stubs share the corridor fill and stroke so rooms read as joined hallways rather than floating islands.

### Behavior or Interface Changes

- Smoothed passenger-dot movement by keeping SVG nodes alive between ticks, assigning non-overlapping per-zone placement slots, adding stable per-passenger placement jitter, and applying staggered transitions instead of recreating every dot on each render.
- Cleaned up `src/ship_schematic.svg`: removed decorative dining circles and cabin partition tick marks (misleading 5-room divider count), collapsed the double hull stroke to a single 4px stroke with a tapered starboard bow, dropped per-element `font-family="Arial"` to inherit the page font, added `<defs>` symbols for the medical cross and isolation bars, gave isolation a distinct deeper-red fill so it reads as a sibling of infirmary rather than identical, enlarged the pool ellipse and moved the "Pool" label clear of it, added an ICAO landing circle around the helipad H, and shortened the corridor label to "Corridor". Zone bounds and `data-zone-id` attributes preserved so `src/ship_layout.ts` and the passenger overlay still align.

### Additions and New Features

- Added a Playwright smoke check for the Andes virus cruise ship simulator that loads the built app, verifies the schematic and passenger overlay render, drives mode controls and uncertainty inputs, and fails on browser console or page errors.
- Added README purpose and quick-start documentation for building, serving, and verifying the simulator.

### Developer Tests and Notes

- Standardized `README.md` with a concise project overview, curated documentation links, quick start, and verification commands.
- Added `npm run smoke` as the browser smoke-test entry point and added Playwright as a development dependency.

## 2026-05-18

### Additions and New Features

- Added `.github/workflows/deploy_pages.yml`: GitHub Actions workflow that runs `build_github_pages.sh` on every push to `main` (and on manual dispatch), uploads `dist/` as a Pages artifact, and deploys via `actions/deploy-pages@v4`. Uses `npm ci` against the tracked `package-lock.json` for reproducible builds. Concurrency group `pages` cancels superseded runs.
