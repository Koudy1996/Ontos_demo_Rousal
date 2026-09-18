// @effect-diagnostics nodeBuiltinImport:off -- Migration safety is checked against its generated SQL; expires: 2027-03-31.
import { readFileSync } from 'node:fs';

import { expect, it } from 'effect-rstest';

it('fails closed instead of remapping purchase Units in existing measured choices', () => {
  const migration = readFileSync(
    new URL('../../drizzle/20260918050031_lethal_black_tom/migration.sql', import.meta.url),
    'utf-8',
  );
  expect(migration).toContain('Configuration Unit migration requires verified mapping of existing measured choices');
  expect(migration).toContain('catalog_configuration_choices_unit_fk');
  expect(migration).toContain('configuration_unit_revisions');
  expect(migration).toContain('catalog_configuration_unit_revisions_append_only');
});
