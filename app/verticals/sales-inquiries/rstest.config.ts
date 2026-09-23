import { createRequire } from 'node:module';

import { withModernConfig } from '@modern-js/adapter-rstest';
import { defineConfig } from '@rstest/core';

Object.assign(globalThis, { require: createRequire(import.meta.url) });

// Migration scripts contain generic arrows in .mts files, supported by TypeScript.
const swc = {
  jsc: { parser: { disallowAmbiguousJsxLike: false, syntax: 'typescript' } },
} as const;

export default defineConfig({
  projects: [
    {
      clearMocks: true,
      extends: withModernConfig({
        configPath: './modern-rstest.config.ts',
      }),
      include: ['tests/components/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
      name: 'component',
      output: {
        module: true,
      },
      restoreMocks: true,
      testEnvironment: 'happy-dom',
    },
    {
      include: ['tests/integration/**/*.test.ts'],
      name: 'integration',
      testEnvironment: 'node',
      testTimeout: 30_000,
    },
    {
      include: ['tests/unit/**/*.test.ts'],
      name: 'unit',
      testEnvironment: 'node',
      tools: { swc },
    },
  ],
});
