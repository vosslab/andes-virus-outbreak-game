#!/usr/bin/env bash
# run_web_server.sh - local development preview for the GitHub Pages build.

#set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PORT="${PORT:-$((8000 + RANDOM % 1000))}"

./build_github_pages.sh

echo "Serving dist/ at http://localhost:${PORT}/"
source source_me.sh
python3 -m http.server "${PORT}" --directory dist
