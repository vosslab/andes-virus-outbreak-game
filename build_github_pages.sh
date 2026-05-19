#!/usr/bin/env bash
# build_github_pages.sh - canonical production build for GitHub Pages.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

rm -rf dist
mkdir -p dist

npx tsc --noEmit -p src/tsconfig.json

npx esbuild src/init.ts \
	--bundle \
	--format=esm \
	--target=es2020 \
	--platform=browser \
	--outfile=dist/main.js

cp src/index.html dist/index.html
cp src/style.css dist/style.css
cp src/ship_schematic.svg dist/ship_schematic.svg

touch dist/.nojekyll

test -f dist/index.html
test -f dist/ship_schematic.svg

echo "Built dist/ (GitHub Pages-ready)."
