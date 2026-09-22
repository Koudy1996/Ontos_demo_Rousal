import { readFileSync } from 'node:fs';

import { expect, it } from 'effect-rstest';

it('migrates a serialized owner assessment and reservation barrier instead of a stub routine', () => {
  const migration = readFileSync(
    new URL('../../drizzle/20260922170000_market-retirement-authority/migration.sql', import.meta.url),
    'utf8',
  );

  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION "commerce_customer_context"."assess_market_retirement_affected_use"',
  );
  expect(migration).toContain('FROM market_bootstrap_policy_revisions');
  expect(migration).toContain('FROM purchase_proposal_revisions');
  expect(migration).toContain("'BOOTSTRAP_DEFAULT'");
  expect(migration).toContain("'CURRENT_PROPOSAL'");
  expect(migration).toContain("'RETAINED_HISTORY'");
  expect(migration).toContain('pg_advisory_xact_lock');
  expect(migration).toContain("CONSTRAINT = 'market_retirement_reservation_conflict'");
  expect(migration).toContain('market_bootstrap_policy_retirement_guard');
  expect(migration).toContain('purchase_proposal_market_retirement_guard');
  expect(migration).toContain("SET lifecycle = 'COMMITTED', reservation_version = reservation_version + 1");
  expect(migration).toContain("SET lifecycle = 'RELEASED', reservation_version = reservation_version + 1");
});
