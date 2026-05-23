# Epidemiology model

This document describes the SEPIR compartmental model used by the simulator. The conceptual
primer for SIR / SEIR / SEIRS lives in [SEIR_Simulation.md](SEIR_Simulation.md); this file
documents the SEPIR extension (split I into pre-symptomatic + symptomatic), the agent-based
implementation, and the calibration to a deterministic ground-truth ODE.

All R0 / Rt / herd-immunity values displayed in the UI are **calibrated effective equivalents**,
not direct mechanistic identities. The agent simulation is spatial and contact-radius based; the
closed-form mass-action expressions assume homogeneous mixing. UI labels read "effective R0",
"effective Rt", and "approx. herd immunity threshold" to flag this.

## Compartments

| Symbol | Name | Meaning |
| --- | --- | --- |
| S | healthy | Susceptible. Can acquire infection. |
| E | exposed | Latent. Infected but not yet infectious. |
| P | pre_symptomatic | Infectious, no symptoms. (Design YAML label `infected` maps here.) |
| I | symptomatic | Infectious, symptomatic. |
| R | recovered | Immune. With &omega; &gt; 0, drifts back to S. |
| isolated | isolated | Behavioral state derived from I via `isolation_goal_rate`. Not a SEIRS compartment per Q6. |

## Rates

All rates are in units of per day. Sim ticks map to days via `DT_DAYS = 1 / 240`
(one tick = 6 simulated minutes); see [src/sim_constants.ts](../src/sim_constants.ts).

| Rate | Meaning | Period |
| --- | --- | --- |
| &beta;_P | Pre-symptomatic transmission rate | n/a |
| &beta;_I | Symptomatic transmission rate | n/a |
| &sigma; | E -&gt; P rate | latent period = 1 / &sigma; |
| &rho; | P -&gt; I rate | pre-symptomatic period = 1 / &rho; |
| &gamma; | I -&gt; R rate | symptomatic period = 1 / &gamma; |
| &omega; | R -&gt; S rate | immunity period = 1 / &omega; (0 = no waning, SEPIR special case) |
| isolation_goal_rate | I -&gt; isolated (behavioral) | not a SEIRS rate; intervention layer |

## ODE system

The deterministic ground-truth SEPIR ODE is implemented in
[pipeline/seir_ode.py](../pipeline/seir_ode.py). Normalized mass-action form:

```
dS/dt = -beta_P * S * P / N - beta_I * S * I / N + omega * R
dE/dt =  beta_P * S * P / N + beta_I * S * I / N - sigma * E
dP/dt =  sigma * E - rho * P
dI/dt =  rho * P - gamma * I
dR/dt =  gamma * I - omega * R
```

`S + E + P + I + R = N` is conserved to machine precision (verified to 6e-15 across
60-day RK4 integration with `dt = 0.001 day`).

## Derived quantities

The agent sim displays three derived values live in the science panel; see
[src/epi_derived.ts](../src/epi_derived.ts).

- Effective R0 = (&beta;_P / &rho;) + (&beta;_I / &gamma;)
- Effective Rt = effective R0 &times; (S / N), recomputed each tick.
- Approx. herd immunity threshold = 1 - (1 / effective R0), clamped to 0 when R0 &le; 1.

The "effective" qualifier is load-bearing. The agent sim's contact graph is spatial; the
expressions above assume homogeneous mass-action mixing. The calibration step below pins the
per-pair transmissibility so the agent sim reproduces the ODE's mean-field behavior in the
homogeneous-mixing limit (single large room, large N).

## Calibration

The constants in [src/sim_constants.ts](../src/sim_constants.ts) form a coupled tuple:

```
DT_DAYS                 = 1 / 240   (tick = 6 simulated minutes)
CONTACT_RADIUS          = 28 px     (per-pair contact cutoff)
SPATIAL_HASH_CELL_SIZE  = 56 px     (neighbor-query bucket)
PERCEPTION_RADIUS       = 84 px     (agent line-of-sight)
BETA_PAIR_SCALE         = 1.0    (placeholder; M7b stochastic calibration deferred)
```

`BETA_PAIR_SCALE` ships as a placeholder of 1.0. M7b's analytic calibration writes the
intended per-pair scaling factor, but the full stochastic agent-vs-ODE validation across 32
seeds has not been executed. Until a stochastic comparison is run, the displayed effective R0
reflects the rate set in `src/scenarios.ts` directly, not a contact-radius-calibrated value.

Any change to the other constants (DT_DAYS, CONTACT_RADIUS, SPATIAL_HASH_CELL_SIZE,
PERCEPTION_RADIUS) invalidates the calibration; M7b's
[pipeline/calibrate_baseline.py](../pipeline/calibrate_baseline.py) must be rerun and the new
`BETA_PAIR_SCALE` written back. Risk register entry R2 covers this; M8 perf tuning forces
recalibration if `SPATIAL_HASH_CELL_SIZE` changes.

Acceptance gate G7:
- Single-room homogeneous-mixing fixture, N = 1000, &omega; = 0, 32 seeds.
- Stochastic peak prevalence and time-to-peak match the ODE within +-10%.
- Final size matches `1 - exp(-R0 * (1 - S_inf))` within +-5%.
- Baseline ship scenario displays effective R0 within +-10% of analytic target.

## Default scenario rates

Values from [src/scenarios.ts](../src/scenarios.ts) `DEFAULT_SEPIR_RATES`:

| Rate | Value |
| --- | --- |
| &beta;_P | 0.3 per day |
| &beta;_I | 0.6 per day |
| &sigma; | 1 / 3 per day (latent period 3 days) |
| &rho; | 0.5 per day (pre-symptomatic period 2 days) |
| &gamma; | 1 / 7 per day (symptomatic period 7 days) |
| &omega; | 0 per day (no waning; SEPIR not SEPIRS) |
| isolation_goal_rate | 0 per day (off by default) |

Resulting effective R0 = 0.3 / 0.5 + 0.6 / (1 / 7) = 0.6 + 4.2 = **4.8**.

ODE prediction at these rates (N = 1000, initial infectious = 1, 60 days):
- Peak prevalence: 366 of 1000 at day 38.67.
- Final size: 98.85%.

Per-preset overrides:

| Preset | Rate set | isolation_goal_rate |
| --- | --- | --- |
| normal_cruise | DEFAULT_SEPIR_RATES | 0 |
| reduced_gathering | DEFAULT_SEPIR_RATES | 0 |
| cabin_stay | DEFAULT_SEPIR_RATES | 0 |
| cleaning_emphasis | DEFAULT_SEPIR_RATES | 0 |
| fast_isolation | ISOLATION_SEPIR_RATES | 0.2 per day |
| named_seed | DEFAULT_SEPIR_RATES | 0 |

## Force-field doors

Doors in [data/ship.yaml](../data/ship.yaml) are permeable wall gaps with no state, no open /
close flag, no occupancy queue. See plan addendum D5 and
[SHIP_YAML_SPEC.md](SHIP_YAML_SPEC.md) for the geometry contract. Disease propagates between
rooms implicitly: an agent walks through a doorway, its `zoneId` updates, and the next exposure
phase queries its new spatial neighborhood. There is no per-door transmission boost.

### Scenario-scoped closed doors (X2)

Individual scenarios can exclude specific doors from the navmesh by listing their IDs in
`ScenarioConfig.closed_doors`. The navmesh is built once at simulation init (`initNavmesh`)
with those doors filtered out; the rest of the simulation sees only the open topology. No
per-tick door state exists: doors are open or closed for the lifetime of a simulation run,
which removes the oscillation / deadlock failure class flagged in
[ARTIFICIAL_LIFE.md](ARTIFICIAL_LIFE.md).

This is distinct from removing a door from `data/ship.yaml`: YAML removal is a permanent
structural change affecting every scenario; `closed_doors` is a per-scenario override that
leaves the underlying geometry intact.

## Parameter migration

Old ad-hoc scenario fields map to SEPIR rates as follows. The canonical version of this table
lives at the top of [src/scenarios.ts](../src/scenarios.ts).

| Old field | New equivalent |
| --- | --- |
| `exposureChanceByContact` | derived from &beta;_P / &beta;_I + spatial proximity (M6b) |
| `incubationTicks` | 1 / &sigma; (days; tick = 1/240 day) |
| `infectiousTicks` | 1 / &gamma; (days) |
| `isolationAfterInfectiousTicks` | 1 / `isolation_goal_rate` (when on) |
| `contaminationDecay` | retained for fomite term (separate) |

The old fields remain in `ScenarioConfig` with `@deprecated` JSDoc markers. M6b's
`computeExposureSepir` and `progressOnePassengerSepir` consume the new SEPIR rate set when
`scenario.sepir_rates` is present; otherwise the legacy tick-counter logic runs. M7 retires the
legacy path after curriculum review.

## Caveats from SEIR_Simulation.md

The agent simulation does not honor several assumptions baked into the closed-form expressions.
Per [SEIR_Simulation.md](SEIR_Simulation.md):

- R0 is not a universal constant. It depends on contact structure, behavior, and environment.
  The 4.8 figure above is the analytic R0 implied by the rate set, not a measurement.
- Rt is the relevant quantity during an outbreak. R0 describes potential in a fully
  susceptible population; Rt = R0 &times; S / N tracks how transmission slows as S depletes.
- The herd immunity threshold 1 - 1/R0 is exact only under homogeneous mixing. Real
  populations are heterogeneous; the agent sim's spatial structure means the actual threshold
  varies by sub-population and contact patterns.
- The agent sim's spatial / contact-radius transmission does not equal mass-action `betaSI/N`
  except in the large-N limit with the calibrated `BETA_PAIR_SCALE`. Outside that limit,
  outbreaks shaped by room-graph topology (corridor bottlenecks, isolation room separation)
  will differ from the ODE prediction.

## References

- [SEIR_Simulation.md](SEIR_Simulation.md) -- conceptual SIR / SEIR / SEIRS primer.
- [SHIP_YAML_SPEC.md](SHIP_YAML_SPEC.md) -- ship geometry source of truth (rooms, doors).
- [ARTIFICIAL_LIFE.md](ARTIFICIAL_LIFE.md) -- agent-based simulation design background.
- [pipeline/seir_ode.py](../pipeline/seir_ode.py) -- deterministic SEPIR ODE integrator.
- [pipeline/calibrate_baseline.py](../pipeline/calibrate_baseline.py) -- calibration driver.
- [src/sim_constants.ts](../src/sim_constants.ts) -- pinned calibration tuple.
- [src/epi_derived.ts](../src/epi_derived.ts) -- effective R0 / Rt / herd computation.
- [src/scenarios.ts](../src/scenarios.ts) -- per-preset SEPIR rate sets.
