import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  AttributeValuesConflict,
  mapAttributeValuesWriteError,
  validateOverrideRemovalBasis,
} from '../../src/persistence/attribute-values-persistence.ts';
import { CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

describe('Attribute value persistence error boundary', () => {
  it('removes an override only against the current inherited source revision', () => {
    expect(validateOverrideRemovalBasis(2, 3, false, true)).toMatchObject({ conflict: 'BASIS_CHANGED' });
    expect(validateOverrideRemovalBasis(null, null, true, false)).toMatchObject({ conflict: 'REQUIRED' });
    expect(validateOverrideRemovalBasis(3, 3, false, false)).toMatchObject({ conflict: 'INAPPLICABLE' });
    expect(validateOverrideRemovalBasis(3, 3, true, true)).toBeNull();
    expect(validateOverrideRemovalBasis(null, null, false, false)).toBeNull();
  });
  it('classifies only its exact append-only invocation constraint', () => {
    expect(
      mapAttributeValuesWriteError({ code: '23505', constraint: 'catalog_attribute_value_revisions_invocation_uk' }),
    ).toMatchObject({ conflict: 'ACTION_INVOCATION_ID' });
  });

  it('does not invent a business conflict from an unrelated or indeterminate database failure', () => {
    for (const cause of [
      { code: '23505', constraint: 'catalog_attribute_value_sets_product_uk' },
      { code: '23503', constraint: 'catalog_attribute_value_items_controlled_fk' },
      new Error('duplicate'),
    ]) {
      const mapped = mapAttributeValuesWriteError(cause);
      expect(Schema.is(AttributeValuesConflict)(mapped)).toBe(false);
      expect(Schema.is(CatalogPersistenceUnavailable)(mapped)).toBe(true);
      expect(mapped.cause).toBe(cause);
    }
  });
});
