# Changelog

## 2026-05-19

### Additions and New Features

- Added a Playwright smoke check for the Andes virus cruise ship simulator that loads the built app, verifies the schematic and passenger overlay render, drives mode controls and uncertainty inputs, and fails on browser console or page errors.
- Added README purpose and quick-start documentation for building, serving, and verifying the simulator.

### Developer Tests and Notes

- Added `npm run smoke` as the browser smoke-test entry point and added Playwright as a development dependency.

## 2026-05-18

### Additions and New Features

- Added `.github/workflows/deploy_pages.yml`: GitHub Actions workflow that runs `build_github_pages.sh` on every push to `main` (and on manual dispatch), uploads `dist/` as a Pages artifact, and deploys via `actions/deploy-pages@v4`. Uses `npm ci` against the tracked `package-lock.json` for reproducible builds. Concurrency group `pages` cancels superseded runs.
