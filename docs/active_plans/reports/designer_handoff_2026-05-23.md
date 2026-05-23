# Designer handoff: status + open ship-design questions

Date: 2026-05-23. Audience: ship designer. Repo:
`/Users/vosslab/nsh/TYPESCRIPT/hantavirus-outbreak-game`.

This doc summarizes what the simulator currently does, where the ship design slots in, and the
open questions that need a design call before the next iteration.

## TL;DR

- The agent-based outbreak simulator is functionally complete: passengers move in continuous
  space, route through rooms via A*, and transmit a SEPIR-style infection on contact.
- The ship is driven by `data/ship.yaml` -- a single source of truth that emits both the SVG hull
  and the runtime room data.
- Three rooms in the current ship are unreachable. Several design questions about the YAML and the
  doorway layout need a human call.
- Performance is the biggest remaining engineering problem (about 15x slower than target at
  N=1000 passengers), but it does not block design review.

## What works today

- **Ship rendering.** The cruise-ship hull (1008 x 560 px viewBox, 36 x 20 tile grid at 28 px
  per tile) renders on first paint from `dist/ship_schematic.svg`. The hull, rooms, doorways,
  and labels are all generated from `data/ship.yaml` by `pipeline/generate_ship_svg.py`. No
  hand-authored SVG to maintain.
- **37 rooms.** Bow promenades, port + starboard cabin runs, owner's suites, port + starboard
  corridors, spa, library, dining, galley, casino, theater, full-beam atrium, infirmary,
  isolation, gym, pool, arcade, kids club, lifeboats, sun deck aft, crew quarters, crew mess,
  comms, engineering, tender bay, helideck.
- **47 doorways.** Each door is a permeable 1-tile wall opening with no state -- agents pass
  straight through, no animation, no occupancy queue. Closing a room = removing its door from
  the YAML and regenerating.
- **16 named passengers.** Liu Wei, Marisol Vega, Dre Okafor, Yuki Tanaka, Petra Stern, Omar
  Haddad, Inez Cruz, Roman Kade, Sora Matsui, Felipe Romero, Aisha N'Diaye, Carl Brandt,
  Sven Lindqvist, Mei-ling Zhao, Hana Park, Tomas Reyes. Each has a role
  (passenger / crew / officer), initial state, and starting tile.
- **Agent behavior.** Each passenger picks a destination room, A*-routes through the room graph,
  and walks there using six Reynolds-style steering forces (separation, alignment, cohesion,
  target-seek, obstacle-avoid, doorway-bias). They respect walls and pass through doorways. Per-
  agent traits (walking speed, reaction time, contact multiplier, risk tolerance) are sampled
  from seeded normal distributions, so the crowd is not robotic-uniform.
- **Infection model.** Passenger health follows a SEPIR sequence: healthy -> exposed ->
  pre-symptomatic -> symptomatic -> recovered, with optional isolation as a behavioral
  intervention. Transmission happens by proximity: any infectious agent within ~28 px of a
  susceptible one has a per-tick infection chance. Per-day rates beta_P, beta_I, sigma, rho,
  gamma, omega come from `src/scenarios.ts`. The default scenario implies an effective R0 of
  4.8.
- **Six scenarios.** Normal cruise, reduced gathering, fast isolation, cabin stay, cleaning
  emphasis, named-seed start. Two stress presets (`high_variability`, `large_crowd`) exist in
  code but are not yet exposed in the UI dropdown.
- **Determinism.** The whole simulation is seeded; the same seed gives the same passenger
  trace, every time. There is no `Math.random()` anywhere in the runtime.

## How the ship moves from your design to the running app

```
design/ship-spec.yaml       (your original spec)
        |
        v
data/ship.yaml              (working schema; same shape, lightly trimmed)
        |
        v
pipeline/generate_ship_svg.py     (Python; reads YAML, emits hull + layout)
        |
        +---> src/ship_schematic.svg            (browser renders this)
        +---> src/ship_layout.generated.ts      (sim consumes this)
        |
        v
build_github_pages.sh        (regenerates SVG on every build)
        |
        v
dist/                        (served to the browser)
```

Pull `data/ship.yaml` to edit room geometry, types, colors, or doorways. Re-run
`python3 pipeline/generate_ship_svg.py` and the SVG plus runtime room data update together.
`docs/SHIP_YAML_SPEC.md` is the schema reference; `docs/EPI_MODEL.md` covers the disease side.

## Open ship-design questions

These are the calls that need a designer's review before the next iteration. They are roughly
ordered by impact on the simulation.

### Q1. Three rooms are currently unreachable

`obs_s` (forward promenade, starboard), `sun_deck` (aft sun deck), and `helideck` have no
doors in `data/ship.yaml`. A passenger placed in one of those rooms cannot get out, and no
passenger can navigate in. Two ways to resolve:

- Add doorways so each room connects to its neighbor (preferred for gameplay -- isolated rooms
  shrink the playable ship).
- Treat them as intentionally isolated (e.g., crew-only zones reached only by stairwells we do
  not model). If so, document and accept that the simulator will never route passengers there.

For the forward promenade specifically, the port side (`obs_p`) connects to the bow via a
vertical door; the starboard side is the missing mirror.

### Q2. Doorway density and bottlenecks

The current 47 doorways are distributed evenly across cabin rows and inner-ring rooms. At
N=1000 passengers, a few doorways will inevitably become contested chokepoints (cabin-to-
corridor, atrium-to-dining, lifeboat exits). Two design questions:

- Are the chokepoints intended? They are realistic, and the simulator can show queuing as an
  educational point.
- Should secondary doors be added on long walls (e.g., 28-passenger cabin runs sharing a single
  door to the corridor)? More doors = smoother flow but less narrative tension.

### Q3. Atrium scale

The full-beam atrium is the largest public room and currently the highest-traffic intersection.
At default rates the atrium is where most transmission happens. The question is whether the
atrium should:

- Stay full-beam (current; high traffic, high spread).
- Split into atrium + secondary public room (lobby) to ease congestion.
- Add a service stairwell that lets crew bypass it.

### Q4. Cabin density vs cabin count

Cabin runs currently model ~18 cabins per run with a single block geometry. Each block is one
"room" in the layout, so all 18 occupants share one space. Two paths:

- Keep the abstraction (one block per run). Simpler; visually clear.
- Sub-divide each run into 2-3 sub-rooms so contact within a cabin block is also bounded.

If we sub-divide, every existing cabin door must be split into multiple doors. This is a
larger geometry change.

### Q5. Glyphs and icons

The `glyph` field on each `room_type` in the YAML supports Unicode symbols (anchor for command,
star for suite, cross for medical, etc.). The runtime currently ignores them (rooms render as
filled rects with text labels). Worth doing if the design needs more visual differentiation
than fill color provides. If yes, designer should provide the actual glyph set per room type
and confirm we can carry ASCII-escaped HTML entities through to the SVG.

### Q6. Helideck and lifeboat semantics

The helideck and lifeboat stations exist as rooms but have no special gameplay treatment. Are
they:

- Display-only rooms (visual flair, no gameplay effect)?
- Evacuation goals (overrides for movement during the curriculum scenario)?
- Crew-only?

The current sim treats them like any other room.

### Q7. Room type palette

The current 15 room types each carry a fill color and an ink color (label). The palette is
inherited from the original spec. Two questions:

- Does it read well on the live ship? (We can produce a screenshot.)
- Should the `medical` color be reserved for active medical zones only? Currently both
  `infirmary` and `isolation` use it.

### Q8. Initial agent placement

The 16 named seed agents are placed at fixed starting tiles (see `agents:` block in
`data/ship.yaml` and the design YAML). The placement is somewhat arbitrary. Reasonable
question: should starting positions tell a small narrative (Dre Okafor stationed near medical
because of a backstory)? Or is placement intentionally generic?

## Technical challenges (engineer-facing; for context only)

These do not block design review. They are listed here so the designer can see the engineering
backdrop.

- **Performance.** Current sim runs ~240 ms per tick at N=1000 passengers; target is 16 ms
  (~30 ticks/sec). About 15x over budget. Likely cause is per-agent obstacle-avoid checking
  every wall segment in the agent's current room each tick. A profiling pass + spatial-hash
  cell-size tuning are the next steps; nothing on the design side needs to change for this.
- **SEPIR calibration.** The model parameters are documented and the displayed R0 is correct,
  but the stochastic agent simulation has not been formally calibrated against the
  deterministic ODE in a homogeneous-mixing fixture. This means the per-pair contact rate is
  set to a placeholder of 1.0 in `src/sim_constants.ts`. The educational R0 figure (4.8) is
  derived from the rate set, not measured.
- **UI scenario selector.** The new `large_crowd` (N=1000), `high_variability` (doubled
  stddevs), and `named_seed` (16 seeded agents) presets are defined in `src/scenarios.ts` but
  not exposed in the live scenario dropdown. Wiring them in is a small follow-up.
- **Legacy code paths.** The simulator still carries a fallback transition + exposure path for
  the pre-SEPIR model. Those paths are unreachable in any shipped scenario but have not yet
  been deleted.

## Files the designer might want to open

- [data/ship.yaml](../../../data/ship.yaml) -- ship geometry source of truth.
- [docs/SHIP_YAML_SPEC.md](../../SHIP_YAML_SPEC.md) -- YAML schema reference.
- [docs/CODE_ARCHITECTURE.md](../../CODE_ARCHITECTURE.md) -- engineer's view of the tick
  pipeline.
- [docs/EPI_MODEL.md](../../EPI_MODEL.md) -- SEPIR rate definitions, ODE check, calibration
  status.
- [docs/ARTIFICIAL_LIFE.md](../../ARTIFICIAL_LIFE.md) -- background on the agent-based design
  approach.
- [design/](../../../design/) -- original design uploads (kept as reference).

## Decisions wanted from this review

Please mark up Q1-Q8 above with one of:

- "ship as-is": current design intentional, no change.
- "adjust": describe the change you want; engineering will pick it up next iteration.
- "park": revisit later; not blocking the next demo.

Anything outside Q1-Q8 (new rooms, new room types, palette overhauls) is welcome -- just call
it out as a separate item.
