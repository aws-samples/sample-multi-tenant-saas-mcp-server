// @ts-check
/**
 * Shared ESLint flat-config factory for mcp_server packages.
 *
 * Each package (src, infra) installs its own lint toolchain into its own
 * node_modules (because they are separate npm roots with separate lockfiles),
 * and passes the resolved plugin modules in here so this file does not need
 * to import them itself. This keeps the base logic in one place while
 * respecting each package's dependency tree.
 *
 * Usage from a package's eslint.config.mjs:
 *
 *   import js from '@eslint/js';
 *   import tseslint from 'typescript-eslint';
 *   import nodePlugin from 'eslint-plugin-n';
 *   import { defineConfig } from 'eslint/config';
 *   import { makeBaseConfig } from '../eslint.config.base.mjs';
 *
 *   export default defineConfig(
 *     makeBaseConfig({
 *       js,
 *       tseslint,
 *       nodePlugin,
 *       tsconfigRootDir: import.meta.dirname,
 *       nodeModule: 'module', // or 'script' for CJS
 *     }),
 *   );
 */

/**
 * @typedef {object} BaseConfigOptions
 * @property {import('@eslint/js')} js
 * @property {import('typescript-eslint')} tseslint
 * @property {import('eslint-plugin-n')} nodePlugin
 * @property {string} tsconfigRootDir - absolute path to the package root (use `import.meta.dirname`)
 * @property {'module' | 'script'} nodeModule - whether the package is ESM ('module') or CJS ('script')
 */

/**
 * Build the shared ESLint flat config array for an mcp_server package.
 *
 * Rule stack:
 *   - @eslint/js               → generic JS correctness rules
 *   - tseslint recommendedTypeChecked → bug-catching TS rules that use type info
 *       (no-floating-promises, no-misused-promises, no-unsafe-*, ...)
 *   - tseslint stylisticTypeChecked   → modern-TS opinions
 *       (prefer-nullish-coalescing, prefer-optional-chain, consistent-type-imports, ...)
 *   - eslint-plugin-n flat/recommended-{module|script} → Node-specific rules
 *   - explicit tseslint/no-deprecated → catch calls to @deprecated APIs
 *     (normally only enabled in strictTypeChecked; we opt in individually)
 *
 * Intentionally not included yet:
 *   - Prettier / eslint-config-prettier (separate follow-up PR)
 *   - strictTypeChecked (mostly stylistic opinions on top of recommended)
 *
 * @param {BaseConfigOptions} opts
 */
export function makeBaseConfig({ js, tseslint, nodePlugin, tsconfigRootDir, nodeModule }) {
    const nodeConfig =
        nodeModule === 'module'
            ? nodePlugin.configs['flat/recommended-module']
            : nodePlugin.configs['flat/recommended-script'];

    // Returned as a plain array so the caller can wrap it in ESLint's
    // `defineConfig()` (or spread it alongside package-specific overrides).
    return [
        // 1. Global ignores — a config object with only `ignores` applies globally
        //    per the flat-config spec.
        {
            ignores: [
                'dist/**',
                'cdk.out/**',
                'node_modules/**',
                '**/*.d.ts',
                // ESLint configs themselves — no point type-checking our own config.
                'eslint.config.mjs',
                'eslint.config.base.mjs',
            ],
        },

        // 2. Base JS rules.
        js.configs.recommended,

        // 3. Node-specific rules (module vs script variant picked above).
        nodeConfig,

        // Package-wide overrides to the Node plugin defaults.
        {
            rules: {
                // `tsc` / `vitest` / CDK's `ts-node` all resolve imports themselves
                // with full awareness of tsconfig (paths, moduleResolution, etc.).
                // Letting eslint-plugin-n duplicate that check introduces false
                // positives around extensionless imports and needs separate wiring.
                // We turn these rules off globally — tsc owns the real check.
                'n/no-missing-import': 'off',
                'n/no-missing-require': 'off',

                // These rules are meant for packages published to npm, where
                // importing a devDependency from shipped code is a real bug.
                // mcp_server is a deployable app (Docker image / ECS task), not
                // a published package, so the "published vs dev" distinction
                // doesn't apply here.
                'n/no-unpublished-import': 'off',
                'n/no-unpublished-require': 'off',
            },
        },

        // 4. TS type-aware rule packs. These require parserOptions below.
        ...tseslint.configs.recommendedTypeChecked,
        ...tseslint.configs.stylisticTypeChecked,

        // 5. Language + parser options + a couple of rule tweaks for TS files.
        {
            files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
            languageOptions: {
                parserOptions: {
                    // projectService auto-discovers tsconfig.json for each file and
                    // handles files outside `include` gracefully (vs the older `project` option).
                    projectService: true,
                    tsconfigRootDir,
                },
            },
            rules: {
                // Opt in to @deprecated API detection without adopting all of strict-type-checked.
                '@typescript-eslint/no-deprecated': 'error',

                // Allow `_`-prefixed unused args/locals — common convention for
                // intentionally-unused params (e.g. Express `next`, handler signatures).
                '@typescript-eslint/no-unused-vars': [
                    'error',
                    {
                        argsIgnorePattern: '^_',
                        varsIgnorePattern: '^_',
                        caughtErrorsIgnorePattern: '^_',
                    },
                ],
            },
        },

        // 6. Disable type-aware rules on plain .js / .cjs / .mjs files — they
        //    aren't part of the TS project and would otherwise blow up.
        {
            files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
            ...tseslint.configs.disableTypeChecked,
        },
    ];
}
