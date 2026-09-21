import { readFileSync } from 'node:fs';

import { expect, it } from 'effect-rstest';

it('binds the application and SpiceDB datastore URLs into the migrator environment', () => {
  const zeropsYaml = readFileSync(new URL('../../zerops.yaml', import.meta.url), 'utf-8');
  const migratorStart = zeropsYaml.indexOf("  - setup: 'migrator'");
  const migratorEnd = zeropsYaml.indexOf('\n  - setup:', migratorStart + 1);

  expect(migratorStart).toBeGreaterThanOrEqual(0);
  expect(migratorEnd).toBeGreaterThan(migratorStart);
  const migrator = zeropsYaml.slice(migratorStart, migratorEnd);

  expect(migrator).toContain(`DATABASE_URL: \${shellsuperapp_DATABASE_URL}`);
  expect(migrator).toContain(`SPICEDB_DATABASE_URL: \${spicedb_SPICEDB_DATASTORE_CONN_URI}`);
});
