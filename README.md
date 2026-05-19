# Hantavirus Outbreak Game

Browser-based Andes virus cruise ship outbreak simulator for classroom discussion. The app renders a schematic ship, overlays passenger health states, and lets students compare scenario assumptions such as incubation time, close-contact risk, isolation speed, movement, cleaning, and optional surface-contact what-ifs. This is an educational simulator, not medical advice or outbreak forecasting.

## Documentation

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
npm run build
npm run smoke
pytest tests/
```
