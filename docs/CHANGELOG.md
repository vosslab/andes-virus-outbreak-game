# Changelog

## 2026-05-19

### Fixes and Maintenance

- Bumped `esbuild` dev dependency from `^0.24.0` to `^0.25.0` (regenerated `package-lock.json`) to clear GitHub Dependabot advisory GHSA-67mh-4wv8-2f99 (esbuild dev-server CORS issue, dev-only, not shipped to the browser). Verified `./build_github_pages.sh` still produces `dist/main.js`.
- Removed the giant red column artifact on the ship map. Newly created passenger `<circle>` nodes were being appended with the SVG default `cx=0 cy=0 r=0`, so the new CSS movement transition streaked every fresh dot from the top-left of the hull to its destination over 600ms; infectious red dots stacked into a tall capsule shape. Fix: seed `cx`, `cy`, `r`, and `data-health` on the circle in `getOrCreatePassengerNode` before appending to the DOM (so no prior computed value exists for the transition to interpolate from), and drop `r` from the `.passenger-dot` CSS transition so radius changes on health flips no longer animate.
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
