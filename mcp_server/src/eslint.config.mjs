// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import nodePlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

import { makeBaseConfig } from '../eslint.config.base.mjs';

export default defineConfig(
    ...makeBaseConfig({
        js,
        tseslint,
        nodePlugin,
        tsconfigRootDir: import.meta.dirname,
        nodeModule: 'module', // src/ package.json sets "type": "module"
    }),

    // Package-specific ignores + overrides on top of the base.
    {
        ignores: [
            // Exclude scripts from lint for now — they're one-off admin utilities
            // and aren't part of the deployed runtime.
            'scripts/**',

            // Tests live outside the tsconfig's `include` (see src/tsconfig.json
            // `exclude`). Linting them under the type-aware rule stack would need
            // either a dedicated test-tsconfig or projectService.allowDefaultProject.
            // Both are out of scope for this PR — lint the runtime code first.
            // The unit tests are .js anyway and predate the TS conversion.
            'tests/**',
            'vitest.config.js',
            'vitest.e2e.config.ts',
        ],
    },

    // Tests override is kept for when tests are re-included in a follow-up.
    // It has no effect right now because tests/ is in the ignores above.
    {
        files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
        rules: {
            // Tests routinely cast mocks to `any` for brevity.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
        },
    },
);
