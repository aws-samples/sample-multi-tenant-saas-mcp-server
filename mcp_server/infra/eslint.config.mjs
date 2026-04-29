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
        // infra is a CDK app compiled as CommonJS (see infra/tsconfig.json: "module": "commonjs").
        nodeModule: 'script',
    }),

    // Package-specific ignores on top of the base.
    {
        ignores: [
            // CDK build output.
            'cdk.out/**',
            // The bundled Lambda code has its own nested package/lockfile and is
            // built/deployed independently; lint it separately if needed later.
            'lambda/**',
            // Jest config is a plain JS file for the CDK test harness.
            'jest.config.js',
        ],
    },
);
