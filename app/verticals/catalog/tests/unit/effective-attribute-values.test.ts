import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { AttributeDefinitionSchema } from '../../shared/domain/attribute-values.ts';
import { resolveEffectiveAttributeValues } from '../../shared/domain/effective-attribute-values.ts';
import { ProductTypeCurrentRulesRevisionSchema } from '../../shared/domain/product-type-rules.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const ref = (resourceType: string, resourceId: string) => ({
  moduleId: 'commerce.catalog' as const,
  resourceId,
  resourceType,
  tenantId,
});
const productRef = ref('commerce.catalog.product', '22222222-2222-4222-8222-222222222222');
const variantRef = ref('commerce.catalog.variant', '33333333-3333-4333-8333-333333333333');
const productTypeRef = ref('commerce.catalog.product-type', '44444444-4444-4444-8444-444444444444');
const definition = Schema.decodeUnknownSync(AttributeDefinitionSchema)({
  ref: ref('commerce.catalog.attribute-definition', '55555555-5555-4555-8555-555555555555'),
  label: 'Material',
  meaning: 'Material of the product',
  levels: ['PRODUCT', 'VARIANT'],
  multiplicity: 'MULTIPLE',
  valueKind: 'TEXT',
  specialStates: ['UNKNOWN', 'NOT_APPLICABLE'],
});
const effectiveFrom = '2026-09-01T00:00:00.000Z';
const revisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const rulesRevision = Schema.decodeUnknownSync(ProductTypeCurrentRulesRevisionSchema)({
  effectiveFrom,
  productTypeRef,
  revision: 2,
  revisionId,
  rules: [
    { attributeDefinitionRef: definition.ref, level: 'PRODUCT', required: false },
    { attributeDefinitionRef: definition.ref, level: 'VARIANT', required: false },
  ],
});
const basis = Schema.decodeUnknownSync(ProductTypeCurrentRulesRevisionSchema)({
  effectiveFrom,
  productTypeRef,
  revision: 2,
  revisionId,
  rules: rulesRevision.rules,
});
const currentBasis = {
  currentRevision: 2,
  effectiveFrom,
  evaluatedAt: '2026-09-17T00:00:00.000Z',
  productTypeRef,
  revision: 2,
  revisionId,
} as const;
const text = (value: string) => ({ kind: 'TEXT' as const, text: value });
const productSet = { state: 'SET' as const, revision: 3, values: [text('Steel')] };
const input = {
  basis: currentBasis,
  definition,
  productRef,
  variantProductRef: productRef,
  variantRef,
  rulesRevision: basis,
  productSet,
  variantSet: null,
};

describe('effective Product/Variant attribute values', () => {
  it('inherits live Product values with provenance and follows a later Product revision', () => {
    expect(resolveEffectiveAttributeValues(input)).toMatchObject({
      status: 'CURRENT',
      values: [text('Steel')],
      source: { level: 'PRODUCT', revision: 3 },
      productRevision: 3,
    });
    expect(
      resolveEffectiveAttributeValues({
        ...input,
        productSet: { ...productSet, revision: 4, values: [text('Stainless')] },
      }),
    ).toMatchObject({ status: 'CURRENT', values: [text('Stainless')], source: { revision: 4 } });
  });

  it('uses the entire explicit multiple override and does not merge Product values', () => {
    const variantSet = { state: 'SET' as const, revision: 6, values: [text('Wood'), text('Aluminum')] };
    expect(resolveEffectiveAttributeValues({ ...input, variantSet })).toMatchObject({
      status: 'CURRENT',
      values: variantSet.values,
      source: { level: 'VARIANT', revision: 6 },
    });
  });

  it('distinguishes explicit UNKNOWN and NOT_APPLICABLE from absent and removal', () => {
    for (const state of ['UNKNOWN', 'NOT_APPLICABLE'] as const) {
      expect(
        resolveEffectiveAttributeValues({
          ...input,
          variantSet: { state: 'SET', revision: 5, values: [{ kind: 'SPECIAL', state }] },
        }),
      ).toMatchObject({ status: 'CURRENT', values: [{ kind: 'SPECIAL', state }], source: { level: 'VARIANT' } });
    }
    expect(resolveEffectiveAttributeValues({ ...input, productSet: null })).toMatchObject({
      status: 'CURRENT',
      values: [],
    });
    expect(
      resolveEffectiveAttributeValues({ ...input, variantSet: { state: 'REMOVED', revision: 7, values: [] } }),
    ).toMatchObject({ status: 'CURRENT', values: [text('Steel')], source: { level: 'PRODUCT' } });
    expect(
      resolveEffectiveAttributeValues({
        ...input,
        productSet: null,
        variantSet: { state: 'REMOVED', revision: 7, values: [] },
      }),
    ).toMatchObject({ status: 'CURRENT', values: [] });
  });

  it('rejects stale removal basis, missing type authority, disallowed inheritance, and empty SET', () => {
    const removed = { state: 'REMOVED' as const, revision: 7, values: [] };
    expect(
      resolveEffectiveAttributeValues({
        ...input,
        variantSet: removed,
        removalBasis: { productRevision: 2, variantRevision: 7 },
      }).status,
    ).toBe('STALE_BASIS');
    expect(
      resolveEffectiveAttributeValues({
        ...input,
        variantSet: removed,
        removalBasis: { productRevision: 3, variantRevision: 7 },
      }).status,
    ).toBe('CURRENT');
    expect(resolveEffectiveAttributeValues({ ...input, basis: undefined }).status).toBe('INVALID_AUTHORITY');
    expect(
      resolveEffectiveAttributeValues({ ...input, productSet: { state: 'SET', revision: 4, values: [] } }).status,
    ).toBe('INVALID_AUTHORITY');
    expect(
      resolveEffectiveAttributeValues({
        ...input,
        rulesRevision: { ...rulesRevision, rules: rulesRevision.rules.filter((rule) => rule.level === 'VARIANT') },
      }).status,
    ).toBe('INVALID_AUTHORITY');
  });
});
