# Hantavirus Outbreak Game

Browser-based Andes virus cruise ship outbreak simulator for classroom discussion.
The app renders a schematic ship, overlays passenger health states, and lets users
compare scenario assumptions such as incubation time, close-contact risk,
isolation speed, movement, cleaning, and optional surface-contact what-ifs.

This is an educational simulator, not medical advice or outbreak forecasting.

## Quick Start

```bash
npm install
npm run build
npm run serve
```

Open the local URL printed by `npm run serve`.

For verification:

```bash
npm run typecheck
npm run build
npm run smoke
pytest tests/
```
