import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { mapCatalogWriteError } from '../../src/persistence/catalog-persistence.ts';
import { CatalogPersistenceConflict, CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

describe('Catalog write error mapping', () => {
  it('maps only the owned invocation uniqueness constraints to a conflict', () => {
    for (const constraint of ['catalog_product_revisions_invocation_uk', 'catalog_product_lifecycle_invocation_uk']) {
      const result = mapCatalogWriteError({ code: '23505', constraint });
      expect(Schema.is(CatalogPersistenceConflict)(result)).toBe(true);
      expect(result).toMatchObject({ conflict: 'ACTION_INVOCATION_ID' });
    }
  });

  it('preserves outage and indeterminate failures as unavailable even when messages mention invocation', () => {
    for (const failure of [
      new Error('invocation write timed out'),
      { code: '08006', constraint: 'catalog_product_revisions_invocation_uk' },
      { code: '23505', constraint: 'other_invocation_uk' },
      { code: '23505', message: 'duplicate invocation' },
    ]) {
      const result = mapCatalogWriteError(failure);
      expect(Schema.is(CatalogPersistenceUnavailable)(result)).toBe(true);
      expect(result.cause).toBe(failure);
    }
  });
});
