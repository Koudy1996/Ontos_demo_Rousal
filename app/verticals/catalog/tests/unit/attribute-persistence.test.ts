import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  AttributePersistenceConflict,
  deriveAttributeImpact,
  mapAttributeWriteError,
} from '../../src/persistence/attribute-persistence.ts';
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

describe('Attribute current impact', () => {
  it('distinguishes direct Product and Variant references from inherited values', () => {
    const sets = [
      { attributeValueSetId: 'p1', currentState: 'SET', productId: 'product-1', variantId: null },
      { attributeValueSetId: 'v2', currentState: 'SET', productId: 'product-1', variantId: 'variant-2' },
      { attributeValueSetId: 'p2', currentState: 'SET', productId: 'product-2', variantId: null },
      { attributeValueSetId: 'v4', currentState: 'REMOVED', productId: 'product-2', variantId: 'variant-4' },
    ];
    const impact = deriveAttributeImpact({
      axisProductIds: ['product-1'],
      controlledValueId: 'steel',
      items: [
        { attributeValueSetId: 'p1', controlledAttributeValueId: 'steel' },
        { attributeValueSetId: 'v2', controlledAttributeValueId: 'aluminium' },
        { attributeValueSetId: 'p2', controlledAttributeValueId: 'steel' },
      ],
      productTypeIds: ['type-1'],
      sets,
      variants: [
        { productId: 'product-1', variantId: 'variant-1' },
        { productId: 'product-1', variantId: 'variant-2' },
        { productId: 'product-2', variantId: 'variant-3' },
        { productId: 'product-2', variantId: 'variant-4' },
      ],
    });
    expect(impact).toEqual({
      directProducts: ['product-1', 'product-2'],
      directVariants: [],
      inheritedVariants: ['variant-1', 'variant-3', 'variant-4'],
      productTypes: ['type-1'],
      variantAxisProducts: ['product-1'],
    });
  });

  it('includes direct variant facts for a definition without merging overridden inheritance', () => {
    expect(
      deriveAttributeImpact({
        axisProductIds: [],
        items: [],
        productTypeIds: [],
        sets: [
          { attributeValueSetId: 'product-set', currentState: 'SET', productId: 'product', variantId: null },
          { attributeValueSetId: 'variant-set', currentState: 'SET', productId: 'product', variantId: 'variant-2' },
        ],
        variants: [
          { productId: 'product', variantId: 'variant-1' },
          { productId: 'product', variantId: 'variant-2' },
        ],
      }),
    ).toMatchObject({
      directProducts: ['product'],
      directVariants: ['variant-2'],
      inheritedVariants: ['variant-1'],
    });
  });
});
