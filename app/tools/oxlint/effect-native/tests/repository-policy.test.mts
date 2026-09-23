import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';

import { expect, it } from 'effect-rstest';

import { appRoot, pluginDirectory, runOxlint } from './oxlint.mts';

// DEVELOPMENT.md classifies installed agent skills as generated local output. Authored source remains included.
const repositorySourcePaths = [
  '.',
  '--ignore-pattern',
  'tools/oxlint/**/tests/fixtures/**',
  '--ignore-pattern',
  '.codex/skills/**',
];

it('all repository source, including tools and root configuration, follows the Effect discrimination policy', () => {
  const run = runOxlint(nodePath.join(pluginDirectory, 'repository-policy.config.ts'), repositorySourcePaths, appRoot);
  expect(run.diagnostics.map(({ code, filename, labels }) => `${filename}:${labels[0]?.span.line} ${code}`)).toEqual(
    [],
  );
  expect(run.exitCode).toBe(0);
});

it('excludes installed skill assets while still checking application, tool, root and authored skill sources', () => {
  const root = mkdtempSync(nodePath.join(tmpdir(), 'ontos-policy-inventory-'));
  try {
    const firstParty = ['apps/demo.ts', 'tools/demo.ts', 'config.ts', '.agents/skills/demo.ts', '.codex/authored.ts'];
    const installed = '.codex/skills/mf/assets/demo.js';
    for (const file of [...firstParty, installed]) {
      const destination = nodePath.join(root, file);
      mkdirSync(nodePath.dirname(destination), { recursive: true });
      writeFileSync(destination, 'export const rejected = value => value instanceof Error;\n');
    }
    const run = runOxlint(nodePath.join(pluginDirectory, 'repository-policy.config.ts'), repositorySourcePaths, root);
    expect(run.exitCode).toBe(1);
    expect(run.diagnostics.map((diagnostic) => diagnostic.filename).toSorted()).toEqual(firstParty.toSorted());
    expect(run.diagnostics.every((diagnostic) => diagnostic.code === 'effect-native(no-instanceof)')).toBe(true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
