# Hantavirus Outbreak Game

Browser-based cruise ship outbreak simulator for classroom use. Renders a schematic ship with passenger health states; students compare scenario assumptions: incubation, contact, isolation, movement, cleaning. Andes virus theme. Educational only.

Play the simulation live: [vosslab.github.io/andes-virus-outbreak-game](https://vosslab.github.io/andes-virus-outbreak-game/)

## Documentation

- [docs/CODE_ARCHITECTURE.md](docs/CODE_ARCHITECTURE.md): Tick pipeline, modules, determinism contract, and performance gates.
- [docs/FILE_STRUCTURE.md](docs/FILE_STRUCTURE.md): Directory map describing where source, data, and tests belong.
- [docs/SHIP_YAML_SPEC.md](docs/SHIP_YAML_SPEC.md): Schema for `data/ship.yaml`, the source of truth for geometry.
- [docs/EPI_MODEL.md](docs/EPI_MODEL.md): SEPIR model, calibration procedure, and ODE acceptance bounds.
- [docs/ARTIFICIAL_LIFE.md](docs/ARTIFICIAL_LIFE.md): Reynolds steering, perception, and agent behavior background.
- [docs/SEIR_Simulation.md](docs/SEIR_Simulation.md): SEIR background reading and ODE reference.
- [docs/PLAYWRIGHT_USAGE.md](docs/PLAYWRIGHT_USAGE.md): Browser smoke-test guidance for Playwright checks.
- [docs/E2E_TESTS.md](docs/E2E_TESTS.md): End-to-end test placement and runtime expectations.
- [docs/TYPESCRIPT_STYLE.md](docs/TYPESCRIPT_STYLE.md): TypeScript style and strict typing rules.
- [docs/REPO_STYLE.md](docs/REPO_STYLE.md): Repository organization, workflow, and changelog rules.
- [docs/lect26e-cotagion-edit.pdf](docs/lect26e-cotagion-edit.pdf): Lecture source used for outbreak, R0, incubation, and flattening-the-curve framing.

## Quick Start

```bash
npm install
npm run build
npm run serve
```

Open the local URL printed by `npm run serve`.

## Testing

For verification:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run smoke
pytest tests/
```
