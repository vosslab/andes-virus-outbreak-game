# Status update: post-designer-handoff iteration

Date: 2026-05-23. Branch: main (uncommitted). Iteration: post-designer-markup pass.

## Headline

Designer reviewed the Q1-Q8 handoff and returned verdicts (7 adjust, 1 park, +3
off-list adds). Engineering shipped Tier 1 (geometry + palette + agent placement),
plus the X2 closed-doors design decision and the canonical SEPIR rate rename.
Ship is unblocked. Code is staged for human review and commit. Tier 2 and M11
remain queued.

## What shipped this session

| Task | Scope | Status |
| --- | --- | --- |
| #41 Tier 1 YAML | Q1 +3 missing doors, Q2 +6 cabin secondary doors, Q7 isolation palette split, Q8 5 agent placements | DONE |
| #42 X2 closed-doors filter | Stateless pre-filter at navmesh init. `ScenarioConfig.closed_doors`, `initNavmesh()` in navigation.ts | DONE |
| #43 isolation_goal_rate rename | Canonical name across types, scenarios, sim, stats, tests, docs | DONE |

Files touched (regenerated + hand-edited): data/ship.yaml, src/ship_layout.generated.ts,
src/ship_schematic.svg, src/navigation.ts, src/simulation.ts, src/types/simulation.ts,
src/scenarios.ts, src/statistics.ts, docs/EPI_MODEL.md, docs/SHIP_YAML_SPEC.md,
docs/CHANGELOG.md.

Verification gates:
- `npx tsc --noEmit` clean
- `npm run lint -- --max-warnings 0` clean
- `pytest tests/` 226 passed / 1 xfailed
- Pipeline regen idempotent

## Design decision: X2 closed doors (option C)

Designer asked for runtime `open: bool` on doors. User decision D5 (force-field
doors, no state) ruled this out. Option C ships instead:

- Doors stay stateless at runtime.
- `data/ship.yaml` may carry optional `default_open: bool` (default true).
- Scenarios may carry `closed_doors: [door_id]`.
- Navmesh builder filters the union (default_open=false + scenario closed_doors)
  once at `createInitialSimulation`. A* never sees the filtered doors.
- No per-tick check, no animation, no oscillation surface.

Closing a room mid-scenario remains "remove door from YAML or list it in
closed_doors", never "flip a runtime flag".

## Designer verdicts (recap)

| Q | Verdict | Status |
| --- | --- | --- |
| Q1 unreachable rooms | Adjust: +3 doors | Done (Tier 1) |
| Q2 chokepoints | Adjust: +1 secondary door per cabin run | Done (Tier 1) |
| Q3 atrium scale | Adjust: full-beam + crew-only stairwell | Queued M11 |
| Q4 cabin sub-divide | Park to v2 | Park |
| Q5 glyphs | Adjust: render at 50% opacity, top-right | Queued (Tier 2) |
| Q6 helideck/lifeboat | Adjust: med_evac + muster + `drill` scenario | Queued M11 |
| Q7 palette | Adjust: isolation -> purple | Done (Tier 1) |
| Q8 placement | Adjust: 5 narrative deltas | Done (Tier 1) |
| X1 ?debug=tiles | Off-list | Queued (Tier 2) |
| X2 door state | REJECTED -> option C | Done (#42) |
| X3 lifeboat sub-divide | Off-list | Blocked on Q6 muster semantics |

## What works

Same as last status, plus:
- Three previously-isolated rooms (obs_s, sun_deck, helideck) now reachable.
- Cabin runs no longer share a single doorway with 18 occupants.
- Isolation rooms render with the new purple palette matching agent isolated state.
- Patient-zero starting tableau readable in 10 seconds (Carl in Casino, Omar in
  Galley, Inez in Infirmary, Sora in Kids Club, Dre already in Isolation).
- Scenarios can now lock specific doors without regenerating geometry.
- SEPIR rate field naming is finally canonical (isolation_goal_rate everywhere).

## Outstanding work

| Bucket | Items | Estimated cost |
| --- | --- | --- |
| Tier 2 (next session) | Q5 glyphs render path, X1 ?debug=tiles overlay | small, parallelizable |
| M11 (own milestone) | Q3 crew-only routing, Q6 med-evac + drill scenario, X3 lifeboat sub-divide, mild/severe SEPIR severity bucket, routing-override layer in simulation.ts, `drill` scenario preset | medium, new subsystem |
| Legacy (pre-existing) | Perf 240ms/tick at N=1000 vs 16ms target | profiling + spatial-hash cell-size sweep |
| Legacy (pre-existing) | Stochastic SEPIR-vs-ODE validation (BETA_PAIR_SCALE=1.0 placeholder) | 32-seed validation across homogeneous-mixing fixture |
| Legacy (pre-existing) | UI selector missing large_crowd, high_variability, named_seed presets | small wiring task |
| Legacy (pre-existing) | Untracked files need `git add` decision (~20 files) | user review |

## Decisions wanted from user

None blocking. Optional inputs:
- Schedule for M11 (Q3 + Q6 + X3 + severity)?
- Address perf gap before or after M11?

## Files for human review

`git status` lists the working tree. The diff to inspect for this session is
limited to the files in the Task #41/#42/#43 file-change lists above. The
remaining tracked changes (untracked pipeline, planning artifacts, ARTIFICIAL_LIFE
doc) are from the prior M0a-M10 sessions and are awaiting the same review pass.

## Pointers

- [docs/EPI_MODEL.md](../../EPI_MODEL.md) -- closed_doors section + isolation_goal_rate.
- [docs/SHIP_YAML_SPEC.md](../../SHIP_YAML_SPEC.md) -- closed_doors contract.
- [docs/CHANGELOG.md](../../CHANGELOG.md) -- 2026-05-23 entries.
- [design/Designer_s_Markup.html](../../../design/Designer_s_Markup.html) -- designer's verdicts source.
- [design/Cruise_Ship_Simulation_Board.html](../../../design/Cruise_Ship_Simulation_Board.html) -- ship board reference.
