# File structure

Directory map for the Hantavirus Outbreak Game repo. One-line purpose per file. Updated as part
of M10 close-out; see [REPO_STYLE.md](REPO_STYLE.md) for repo-level conventions.

## Root

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Agent instructions pointer; loads global style + repo style files. |
| `CLAUDE.md` | Claude-specific entry; loads same style chain as AGENTS.md. |
| `README.md` | Project intro, quick start, doc index. First paragraph is GitHub About text (&le; 250 chars). |
| `package.json` | npm scripts (`build`, `check`, `serve`, `smoke`, `lint`, `format`, `typecheck`) and devDeps. |
| `package-lock.json` | Locked npm dependency tree. |
| `tsconfig.json` | Root TS config (strict mode); `src/tsconfig.json` is a stricter subset for the build. |
| `eslint.config.js` | Flat-config ESLint setup; `.ts` files get type-aware rules, `.mjs`/`.js` get a smaller rule set. |
| `.prettierrc.json` | Prettier formatter config: tabs, tabWidth 4, double quotes, trailing commas, LF, 100ch. |
| `.prettierignore` | Files Prettier skips: centrally-maintained docs, `design/`, `dist/`, `node_modules/`, etc. |
| `.gitignore` | Untracked patterns. |
| `source_me.sh` | Bash environment bootstrap (sets `PYTHONUNBUFFERED`, `PYTHONDONTWRITEBYTECODE`). |
| `run_web_server.sh` | Local dev server runner; serves `dist/`. |
| `build_github_pages.sh` | Canonical production build: regenerates SVG from YAML, tsc, esbuild bundle, copies to `dist/`. |
| `check_codebase.sh` | Codebase gate: typecheck + lint + format:check + test:node (5 steps). |
| `dist_clean.sh` | Removes `dist/`, esbuild caches. |
| `pip_requirements.txt` | Python runtime deps (`pyyaml` for the generator). |
| `pip_requirements-dev.txt` | Python dev deps (pytest, pyflakes, bandit, etc.). |
| `REPO_TYPE` | One-token language tag (`typescript`) read by propagation tooling. |

## src/ -- TypeScript source

Continuous-space agent simulator. All source files are TypeScript strict mode.

| File | Purpose |
| --- | --- |
| `src/init.ts` | App shell entry. Builds the DOM, wires controls, starts the tick loop. |
| `src/simulation.ts` | Tick engine: movement (steering + collision), health transitions (SEPIR), exposure. |
| `src/rendering.ts` | DOM/SVG renderer. Reads `passenger.position` direct; `?debug=1` overlay for perception + steering. |
| `src/navigation.ts` | Room adjacency graph + distance-weighted A* path planner + `nextWaypoint()`. |
| `src/steering.ts` | Composable Reynolds steering primitives (separation, alignment, cohesion, target seek, obstacle avoid, doorway bias). |
| `src/collision.ts` | Polygon clamp + force-field door passage. `stepWithCollision()` keeps agents inside zones, lets them pass through door segments. |
| `src/spatial_hash.ts` | `SpatialHash<T>`: O(1) neighbor queries by bucket. Op-count counters for the M8b perf gate. |
| `src/perception.ts` | Neighbor-by-radius helpers (`buildAgentIndex`, `queryNeighborIds`, `queryNeighborsWithinDistance`). |
| `src/named_agent_seed.ts` | 16 named seed agents transcribed from `data/ship.yaml`. |
| `src/scenarios.ts` | Scenario presets with SEPIR rates + agent-param distributions. |
| `src/sim_constants.ts` | Pinned calibration tuple: DT_DAYS, CONTACT_RADIUS, SPATIAL_HASH_CELL_SIZE, PERCEPTION_RADIUS, BETA_PAIR_SCALE. |
| `src/epi_derived.ts` | Effective R0 / Rt / herd-immunity threshold (calibrated effective equivalents, not direct identities). |
| `src/statistics.ts` | Aggregates passenger state into `SimulationSummary` with derived epi block. |
| `src/random.ts` | Deterministic LCG (`createRandomState`, `chance`, `randomInt`, `normalRandom`). |
| `src/ui_state.ts` | UI control state (scenario id, mode, fomite toggle, etc.). |
| `src/constants.ts` | App title + schematic asset path + viewBox dimensions (1008x560). |
| `src/educational_content.ts` | Classroom-mode copy: disclaimers, assumptions panels. |
| `src/ship_layout.ts` | Thin re-export of `ship_layout.generated.ts` + `getZoneById()` helper. |
| `src/ship_layout.generated.ts` | Generated from `data/ship.yaml` by `pipeline/generate_ship_svg.py`. 37 zones + 47 door segments. |
| `src/ship_schematic.svg` | Generated SVG hull (1008x560). Do not hand-edit; regenerate via the pipeline. |
| `src/ship_roles.ts` | Groups the 37 zones by simulation role (cabin, medical, corridor, public, crew, operations). |
| `src/style.css` | App styles. CSS var `--passenger-move-ms` controls per-tick transition. |
| `src/index.html` | Static HTML shell. |
| `src/tsconfig.json` | TS config for the bundled build. |
| `src/types/` | Type definitions (`simulation.ts`, `ship.ts`, `education.ts`). |

## pipeline/ -- Canonical artifact-producing scripts

Python scripts that produce or validate canonical artifacts. Distinct from `devel/` (dev tooling).

| File | Purpose |
| --- | --- |
| `pipeline/generate_ship_svg.py` | Reads `data/ship.yaml`, emits `src/ship_schematic.svg` + `src/ship_layout.generated.ts`. Idempotent. |
| `pipeline/compare_ship_svg_bounds.py` | Per-zone bounding-box diff between reference and generated SVG. JSON output + 2% tolerance. |
| `pipeline/seir_ode.py` | Deterministic SEPIR ODE integrator (RK4). Ground truth for calibration. |
| `pipeline/calibrate_baseline.py` | Sweeps per-pair beta to match ODE in homogeneous-mixing limit. Writes `BETA_PAIR_SCALE`. |
| `pipeline/tune_spatial_hash.py` | Cell-size sweep [14, 28, 56, 84, 112, 168] px. Picks optimum; triggers M7 recalibration on change. |

## devel/ -- Dev tooling

Repo-maintenance scripts. Not for canonical-artifact production.

| File | Purpose |
| --- | --- |
| `devel/changelog_lib.py` | Shared parser / serializer / git helpers for changelog scripts. |
| `devel/rotate_changelog.py` | Rotates `docs/CHANGELOG.md` per policy in `docs/REPO_STYLE.md`. |
| `devel/query_changelog.py` | Searches active + archived changelogs by date / category / keyword. |
| `devel/commit_changelog.py` | Drafts a commit message from unshipped changelog entries. |
| `devel/bump_version.py` | Version-bump helper (CalVer). |
| `devel/dist_clean.sh` | Universal cleaner: `dist/`, `node_modules/`, caches. |
| `devel/setup_typescript.sh` | TypeScript toolchain bootstrap. |
| `devel/setup_playwright.sh` | Playwright bootstrap. |

## data/ -- Source-of-truth artifacts

| File | Purpose |
| --- | --- |
| `data/ship.yaml` | Single source of truth for ship geometry: 37 rooms, 47 doors, 16 seed agents. |
| `data/reference/ship_schematic_pre_m2.svg` | Frozen M2e visual-diff baseline (snapshot of `design/uploads/ship_schematic.svg`). |
| `data/reference/README.md` | Notes on the reference SVG. |

## design/ -- External design uploads (untracked)

Outsider-produced design artifacts. Read-only reference; not used by the build.

| File | Purpose |
| --- | --- |
| `design/ship-spec.yaml` | Original design YAML; seeded `data/ship.yaml`. |
| `design/ship-board.svg` | Original hand-authored design SVG (1008x560). |
| `design/uploads/ship_schematic.svg` | Hand-authored variant used as M2e reference baseline. |
| `design/Cruise Ship Simulation Board.html` | Standalone HTML preview. |
| `design/app.jsx`, `design/board.jsx`, `design/tweaks-panel.jsx` | React prototypes (not used by this app). |
| `design/screenshots/` | Design preview screenshots. |

`design/` is in `.prettierignore` and excluded from ASCII compliance via `tests/test_ascii_compliance.py` `SKIP_DIRS`.

## docs/ -- Documentation

| File | Purpose |
| --- | --- |
| `docs/REPO_STYLE.md` | Repo-wide conventions (centrally maintained). |
| `docs/PYTHON_STYLE.md` | Python style guide (centrally maintained). |
| `docs/PYTEST_STYLE.md` | pytest conventions (centrally maintained). |
| `docs/TYPESCRIPT_STYLE.md` | TypeScript style guide (centrally maintained). |
| `docs/MARKDOWN_STYLE.md` | Markdown formatting rules (centrally maintained). |
| `docs/CLAUDE_HOOK_USAGE_GUIDE.md` | Claude hook reference (centrally maintained). |
| `docs/E2E_TESTS.md` | End-to-end test conventions (`tests/e2e/`, `tests/playwright/`). |
| `docs/PLAYWRIGHT_USAGE.md` | Playwright browser-smoke guidance. |
| `docs/CHANGELOG.md` | Chronological change record per `docs/REPO_STYLE.md`. |
| `docs/CODE_ARCHITECTURE.md` | Tick pipeline, modules, determinism, calibration coupling. |
| `docs/FILE_STRUCTURE.md` | This file. |
| `docs/SHIP_YAML_SPEC.md` | Schema for `data/ship.yaml`. |
| `docs/EPI_MODEL.md` | SEPIR model, derived quantities, calibration tuple. |
| `docs/SEIR_Simulation.md` | SIR / SEIR / SEIRS conceptual primer. |
| `docs/ARTIFICIAL_LIFE.md` | Agent-based simulation background. |
| `docs/AUTHORS.md` | Maintainer list (centrally maintained). |
| `docs/lect26e-cotagion-edit.pdf` | Source lecture material. |

## tests/ -- Three-tier test layout

Per `docs/E2E_TESTS.md`. Pytest is the fast lane; E2E and Playwright are slow and excluded from
`pytest tests/` via `tests/conftest.py` `collect_ignore = ["e2e", "playwright"]`.

| Pattern | Tier | Runner |
| --- | --- | --- |
| `tests/test_*.py` | Python pytest fast lane | `pytest tests/` |
| `tests/test_*.mjs` | Node fast lane | `node --test` (run from `check_codebase.sh`) |
| `tests/test_*.ts` | TypeScript fast lane | `npx tsx --test` (run from `check_codebase.sh`) |
| `tests/e2e/e2e_*.sh` | Shell E2E | direct invocation |
| `tests/e2e/e2e_*.mjs` | Node E2E | direct invocation |
| `tests/e2e/e2e_*.py` | Python E2E | direct invocation |
| `tests/playwright/smoke_app.mjs` | Browser smoke | `npm run smoke` |

Key fast-lane TS tests:
- `tests/test_spatial_hash.ts` -- spatial hash production code (7 cases).
- `tests/test_perception.mjs` -- perception helpers (6 cases).
- `tests/test_navigation.ts` -- A* + room graph (13 cases).
- `tests/test_steering.ts` -- 6 Reynolds primitives (23 cases).
- `tests/test_collision.ts` -- polygon clamp + force-field passage (6 cases).
- `tests/test_sepir_transitions.ts` -- rate-to-prob + R0/Rt/herd (25 cases).
- `tests/test_perf_op_counts.ts` -- op-count perf gate (5 cases).

Key fast-lane Python tests: lint gates (`test_pyflakes_code_lint.py`, `test_ascii_compliance.py`,
`test_whitespace.py`, `test_indentation.py`), schema (`test_tsconfig_canonical.py`,
`test_eslint_config_present.py`), and pipeline freshness (`test_ship_layout_generated.py`).

Helpers: `tests/file_utils.py` (REPO_ROOT resolution), `tests/conftest.py`.

## .github/ -- CI

| File | Purpose |
| --- | --- |
| `.github/workflows/deploy_pages.yml` | GitHub Actions workflow: build + deploy to GitHub Pages on `main`. |

## dist/ -- Generated build artifact

Created by `./build_github_pages.sh`. Contents: `index.html`, `main.js`, `main.js.map`,
`style.css`, `ship_schematic.svg`, `.nojekyll`. Gitignored.

## Files not in git (working-tree only)

These exist on disk but are intentionally or transiently untracked. The user decides what to
commit. Verify current state with `git status --short` before commit; this list may drift.

- `design/` -- external design uploads; reference only.
- `dist/` -- build output; regenerated by build script.
- `node_modules/` -- npm install target.
- `pipeline/__pycache__/` -- Python bytecode cache.
- `src/ship_layout.generated.ts` -- emitted by `pipeline/generate_ship_svg.py`. May be tracked
  for convenience; the YAML + generator are the source of truth.
- Files staged but not committed at audit time: several `src/` modules (`collision.ts`,
  `navigation.ts`, `perception.ts`, `steering.ts`, `named_agent_seed.ts`), all new TS / mjs
  tests, `pipeline/tune_spatial_hash.py`, `tests/e2e/`, and `docs/archive/`. Run
  `git status --short` to confirm. Stage explicitly before the next commit.

## References

- [REPO_STYLE.md](REPO_STYLE.md) -- repo-wide conventions.
- [CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) -- tick pipeline + module purposes.
- [SHIP_YAML_SPEC.md](SHIP_YAML_SPEC.md) -- geometry schema.
- [EPI_MODEL.md](EPI_MODEL.md) -- SEPIR rates + calibration.
- [E2E_TESTS.md](E2E_TESTS.md) -- test-tier conventions.
