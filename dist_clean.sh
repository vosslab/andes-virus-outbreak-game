#!/usr/bin/env bash
# dist_clean.sh - remove built output and cached build artifacts.
# Run before rebuilding when a stale dist/ might be served (e.g., browser
# still showing the old red-column bug after a fix).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

removed_any=0

if [ -d dist ]; then
	rm -rf dist
	echo "Removed: dist/"
	removed_any=1
fi

if [ -d node_modules/.cache ]; then
	rm -rf node_modules/.cache
	echo "Removed: node_modules/.cache/"
	removed_any=1
fi

if [ -d .esbuild ]; then
	rm -rf .esbuild
	echo "Removed: .esbuild/"
	removed_any=1
fi

if [ "$removed_any" -eq 0 ]; then
	echo "Nothing to clean (dist/ and caches already absent)."
fi

echo "Tip: hard-reload the browser (Cmd-Shift-R / Ctrl-Shift-R) after the next build to bypass cached main.js."
