import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { AttributePersistenceConflict, mapAttributeWriteError } from '../../src/persistence/attribute-persistence.ts';
import { CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

describe('Attribute persistence error boundary', () => {
  it('classifies only exact owned identity and invocation constraints', () => {
    for (const constraint of [
      'attribute_definitions_pkey',
      'controlled_attribute_values_pkey',
      'catalog_attribute_definitions_scope_id_uk',
      'catalog_controlled_values_scope_id_uk',
    ]) {
      expect(mapAttributeWriteError({ code: '23505', constraint })).toMatchObject({ conflict: 'IDENTITY' });
    }
    for (const constraint of [
      'catalog_attribute_definition_revisions_invocation_uk',
      'catalog_controlled_value_revisions_invocation_uk',
    ]) {
      expect(mapAttributeWriteError({ code: '23505', constraint })).toMatchObject({
        conflict: 'ACTION_INVOCATION_ID',
      });
    }
  });

  it('fails closed for unrelated and indeterminate driver failures', () => {
    for (const error of [
      { code: '23505', constraint: 'foreign_constraint' },
      { code: '08006', constraint: 'attribute_definitions_pkey' },
      new Error('duplicate attribute'),
    ]) {
      const mapped = mapAttributeWriteError(error);
      expect(Schema.is(AttributePersistenceConflict)(mapped)).toBe(false);
      expect(Schema.is(CatalogPersistenceUnavailable)(mapped)).toBe(true);
      expect(mapped.cause).toBe(error);
    }
  });
});
