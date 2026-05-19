#!/usr/bin/env bash
# check_codebase.sh - quick developer verification for the browser scaffold.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

npx tsc --noEmit -p src/tsconfig.json

echo "TypeScript check passed."
