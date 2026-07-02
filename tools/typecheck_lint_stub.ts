// tools/typecheck_lint_stub.ts
//
// Picked up by tsconfig.lint.json (which scopes tsc to tests/**/*.ts and
// tools/**/*.ts). This repo has no other .ts files under tests/ or tools/
// yet (tests are .mjs, tools are .mjs), so tsc -p tsconfig.lint.json would
// otherwise exit 2 with TS18003 ("No inputs were found"). Delete this stub
// once a real .ts file lands in either tree.
//
// Per docs/TYPESCRIPT_STYLE.md, seeding a stub .ts is the documented
// workaround for a consumer with no tests/*.ts and no tools/*.ts.

export const _typecheck_lint_stub = true as const;
