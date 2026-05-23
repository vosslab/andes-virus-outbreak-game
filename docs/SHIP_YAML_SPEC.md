# data/ship.yaml schema

Ship geometry specification in YAML format. This is the single source of truth
for the ship layout, replacing hand-authored SVG. The generator
`pipeline/generate_ship_svg.py` converts this specification into
`src/ship_schematic.svg` (SVG rendering) and `src/ship_layout.generated.ts`
(TypeScript data structures).

## Purpose

`data/ship.yaml` defines the hull geometry, room types, room polygons, doorways,
health states, and seed agents for the hantavirus outbreak simulation. All
derived visual and data artifacts are generated deterministically from this
single source.

## Top-level keys

| Key | Type | Description |
| --- | --- | --- |
| `schematic` | object | Hull viewport and tile size. |
| `room_types` | object | Map of type name to styling and metadata. |
| `rooms` | array | Array of room definitions. |
| `doorways` | array | Array of doorway (force-field door) definitions. |
| `health_states` | object | Map of SEPIR state name to color and label. |
| `agents` | array | Array of seed agent definitions. |

## schematic block

Defines the overall ship viewport and measurement units.

| Field | Type | Description |
| --- | --- | --- |
| `width` | int | SVG viewport width in pixels. Computed as cols x tile_size. |
| `height` | int | SVG viewport height in pixels. Computed as rows x tile_size. |
| `tile_size` | int | Pixel size of a single tile (grid unit). |
| `bow` | string | Direction to bow: "left" or "right". |

Example: width=1008, height=560, tile_size=28 implies 36x20 tile grid.

## room_types block

Map of room type name (string key) to a style object with four fields.
There are 16 standard types: command, cabin, suite, corridor, atrium, food,
leisure, wellness, medical, isolation, retail, crew, crew_op, emergency, transit, public.
The `isolation` type was added in the designer markup pass (Q7) with a distinct purple
palette (`#b6a0d0` fill, `#3a1040` ink, `&#x2298;` glyph). The pipeline maps `isolation`
to `"medical"` ZoneKind so simulation logic treats it as a medical zone.

Each type object contains:

| Field | Type | Description |
| --- | --- | --- |
| `fill` | string | Hex color for room interior (#RRGGBB). |
| `ink` | string | Hex color for room label text (#RRGGBB). |
| `label` | string | Human-readable type label (e.g., "Dining"). |
| `glyph` | string | Unicode glyph for room symbol (currently empty). |

Example:
```yaml
command: { fill: "#1f3a4d", ink: "#f3e6c8", label: "Command", glyph: "" }
cabin: { fill: "#cfe2ec", ink: "#1a3a4d", label: "Cabins", glyph: "" }
```

## rooms array

Array of room definitions. Each room is a polygon-based region with a unique ID.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | Unique room identifier (e.g., "bridge", "cab_p1"). |
| `name` | string | yes | Human-readable room name (e.g., "Bridge"). |
| `type` | string | yes | Room type key (must exist in room_types). |
| `polygon` | array[array[int,int]] | yes | Vertices as [x, y] in pixel coords, counter-clockwise. |
| `label_anchor` | array[int,int] | yes | Center point [x, y] for room label text. |
| `doorways` | array[string] | yes | Array of doorway IDs attached to this room. |
| `links` | array[string] | computed | Adjacent room IDs (derived from doorways, not authored). |

Example:
```yaml
- id: bridge
  name: "Bridge"
  type: command
  polygon: [[0, 196], [112, 196], [112, 364], [0, 364]]
  label_anchor: [56, 280]
  doorways: [door_bridge_atrium_1, door_bridge_atrium_2]
```

## doorways array

Array of force-field door definitions. Each doorway connects two rooms and
defines a permeable opening in the hull. Closing a room (during isolation)
is implemented by removing the doorway from the YAML; no open/close state
is stored per-doorway.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique doorway identifier (e.g., "door_bridge_atrium_1"). |
| `between` | array[string,string] | Pair of room IDs that this door connects. |
| `dir` | string | Direction: "h" (horizontal) or "v" (vertical). |
| `tile_anchor` | array[int,int] | Pixel anchor point [x, y] (typically on edge). |
| `segment` | array[array[int,int],array[int,int]] | Start and end pixel coordinates of the opening. |

Example:
```yaml
- id: door_bridge_atrium_1
  between: [bridge, atrium]
  dir: v
  tile_anchor: [112, 252]
  segment: [[112, 252], [112, 308]]
```

## health_states block

Map of health state name (string key) to a state object. The 6-state SEPIR model
(Susceptible-Exposed-Pre-symptomatic-Infected-Recovered) is implemented with
an additional Isolated state for quarantine. Note: crew is a role, not a health
state; all agents (crew and passenger) transition through the same health states.

| State | Color | Description |
| --- | --- | --- |
| `healthy` | #2db48a | Agent is uninfected and susceptible to exposure. |
| `exposed` | #e9b145 | Agent was exposed but not yet infectious. |
| `pre_symptomatic` | #d63a3a | Agent is infectious but not yet showing symptoms. |
| `symptomatic` | #e07856 | Agent is showing visible symptoms (infectious). |
| `isolated` | #7d3aa9 | Agent is quarantined (isolation room). |
| `recovered` | #3a82d6 | Agent recovered or is immune. |

Each state object contains:

| Field | Type | Description |
| --- | --- | --- |
| `color` | string | Hex color for agent indicator (#RRGGBB). |
| `label` | string | Human-readable state label. |

Example:
```yaml
healthy:
  color: "#2db48a"
  label: "Healthy"
exposed:
  color: "#e9b145"
  label: "Exposed"
```

## agents array

Array of seed agent definitions. Each agent is a named individual with a role,
initial health state, and location on the ship. Agents transition through
health states during simulation via stochastic processes.

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique agent ID (e.g., "A01"). |
| `name` | string | Agent's name. |
| `role` | string | Role: "passenger", "crew", or "officer". |
| `state` | string | Initial health state (key in health_states). |
| `pixel_coords` | array[int,int] | Initial position [x, y] in ship pixels. |

Example:
```yaml
- id: A01
  name: "Liu Wei"
  role: passenger
  state: healthy
  pixel_coords: [210, 98]

- id: A07
  name: "Inez Cruz"
  role: crew
  state: healthy
  pixel_coords: [154, 350]
```

## Regenerating artifacts

When `data/ship.yaml` is modified, regenerate all derived artifacts by running:

```bash
python3 pipeline/generate_ship_svg.py
```

This produces:
- `src/ship_schematic.svg` (hull rendering with rooms, labels, doorways)
- `src/ship_layout.generated.ts` (TypeScript ShipLayout literal with zones and doors)

The generator is idempotent: re-running with unchanged YAML produces byte-identical
output. A freshness test (`tests/test_ship_layout_generated.py`) enforces this
invariant during development.

## Force-field doors

Doorways in `data/ship.yaml` represent permanent hull openings (permeable wall
gaps). There is no per-doorway open/close state at runtime. See the design
plan (D5) for the force-field door contract and stochastic state transition
semantics.

Doorway directions (h/v) align with the compass:
- `h` (horizontal): door runs left-right (connects port/starboard rooms).
- `v` (vertical): door runs top-bottom (connects bow/aft rooms).

### Scenario-scoped door exclusions (closed_doors)

A scenario can exclude specific doors from its navmesh by listing their IDs in
`ScenarioConfig.closed_doors` (TypeScript type, not a YAML field). The navmesh
is rebuilt once at simulation init with those doors filtered out. No per-tick
state exists. This is distinct from removing a door from `data/ship.yaml`:

- YAML removal: permanent structural change; all scenarios and the SVG are
  affected; requires running `pipeline/generate_ship_svg.py` to regenerate.
- `closed_doors`: per-scenario runtime override; underlying YAML geometry is
  unchanged; no regen needed.

Example (in `src/scenarios.ts`):
```typescript
closed_doors: ["door_cab_p1_corr_p_b", "door_cab_s1_corr_s_b"],
```
