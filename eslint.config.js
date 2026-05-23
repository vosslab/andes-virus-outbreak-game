// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Avoid Node-version coupling: import.meta.dirname needs Node >=20.11.
// Use fileURLToPath + path.dirname to stay compatible with Node 18 LTS.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"*.config.js",
			"*.config.mjs",
			"tests/**/*.ts",
			"tests/**/*.tsx",
		],
	},
	eslint.configs.recommended,
	// TypeScript files in src/: type-aware rules, parser project required.
	{
		files: ["src/**/*.ts", "src/**/*.tsx"],
		extends: [...tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: __dirname,
			},
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unused-vars": "error",
			"@typescript-eslint/explicit-function-return-type": "warn",
			"@typescript-eslint/no-floating-promises": "error",
			"no-var": "error",
			"prefer-const": "error",
			"no-implicit-coercion": "warn",
			eqeqeq: "error",
			"no-throw-literal": "error",
			"no-console": "warn",
			// R5 mitigation: deterministic LCG only. Math.random() breaks
			// seed reproducibility, which is a hard contract for the sim.
			"no-restricted-syntax": [
				"error",
				{
					selector: "MemberExpression[object.name='Math'][property.name='random']",
					message:
						"Math.random() breaks determinism. Use src/random.ts LCG via threaded RandomState.",
				},
			],
		},
	},
	// Plain .mjs / .js files: no type-aware rules, no parser project.
	{
		files: ["**/*.mjs", "**/*.js"],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"no-var": "error",
			"prefer-const": "error",
			eqeqeq: "error",
			"no-throw-literal": "error",
		},
	},
);
