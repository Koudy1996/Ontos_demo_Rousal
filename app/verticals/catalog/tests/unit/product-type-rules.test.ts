import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { ProductTypeRulesRevisionSchema, evaluateProductTypeRules } from '../../shared/domain/product-type-rules.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const productTypeRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product-type',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const otherVariantRef = { ...variantRef, resourceId: '55555555-5555-4555-8555-555555555555' } as const;
const material = {
  moduleId: 'commerce.catalog',
  resourceId: '66666666-6666-4666-8666-666666666666',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
} as const;
const note = { ...material, resourceId: '77777777-7777-4777-8777-777777777777' } as const;
const length = { ...material, resourceId: '88888888-8888-4888-8888-888888888888' } as const;
const motorPower = { ...material, resourceId: '99999999-9999-4999-8999-999999999999' } as const;
const revision = Schema.decodeUnknownSync(ProductTypeRulesRevisionSchema)({
  productTypeRef,
  revision: 1,
  rules: [
    { attributeDefinitionRef: material, level: 'PRODUCT', required: true },
    { attributeDefinitionRef: note, level: 'PRODUCT', required: false },
    { attributeDefinitionRef: length, level: 'VARIANT', required: true },
  ],
});

describe('Product Type allowed and required rules', () => {
  it('names missing required Product and specific Variant values, never borrowing from a sibling', () => {
    const result = evaluateProductTypeRules(
      {
        currentProductTypeRef: productTypeRef,
        productRef,
        productValues: [],
        variants: [
          { variantRef, effectiveValues: [] },
          { variantRef: otherVariantRef, effectiveValues: [{ attributeDefinitionRef: length, valid: true }] },
        ],
      },
      revision,
    );
    expect(result.minimumSatisfied).toBe(false);
    expect(result.violations).toEqual([
      { attributeDefinitionId: material.resourceId, kind: 'MISSING_REQUIRED', level: 'PRODUCT' },
      {
        attributeDefinitionId: length.resourceId,
        kind: 'MISSING_REQUIRED',
        level: 'VARIANT',
        variantId: variantRef.resourceId,
      },
    ]);
  });

  it('allows absent optional values but rejects invalid optional and disallowed Current facts', () => {
    const base = {
      currentProductTypeRef: productTypeRef,
      productRef,
      productValues: [{ attributeDefinitionRef: material, valid: true }],
      variants: [{ variantRef, effectiveValues: [{ attributeDefinitionRef: length, valid: true }] }],
    } as const;
    expect(evaluateProductTypeRules(base, revision)).toEqual({ minimumSatisfied: true, revision: 1, violations: [] });
    const result = evaluateProductTypeRules(
      {
        ...base,
        productValues: [
          ...base.productValues,
          { attributeDefinitionRef: note, valid: false },
          { attributeDefinitionRef: motorPower, valid: true },
        ],
      },
      revision,
    );
    expect(result.violations.map((v) => v.kind)).toEqual(['INVALID', 'DISALLOWED']);
  });

  it('gives an untyped Product an empty allowed set and fails closed on mismatched rules', () => {
    const base = {
      productRef,
      productValues: [{ attributeDefinitionRef: material, valid: true }],
      variants: [],
    } as const;
    expect(evaluateProductTypeRules(base, undefined).violations[0]?.kind).toBe('DISALLOWED');
    expect(evaluateProductTypeRules({ ...base, productValues: [] }, undefined).minimumSatisfied).toBe(true);
    expect(
      evaluateProductTypeRules({ ...base, currentProductTypeRef: productTypeRef, productValues: [] }, undefined)
        .minimumSatisfied,
    ).toBe(false);
  });

  it('rejects duplicate rules and cross-tenant Attribute Definitions', () => {
    const decode = Schema.decodeUnknownSync(ProductTypeRulesRevisionSchema);
    expect(() =>
      decode({
        productTypeRef,
        revision: 2,
        rules: [
          { attributeDefinitionRef: material, level: 'PRODUCT', required: true },
          { attributeDefinitionRef: material, level: 'PRODUCT', required: false },
        ],
      }),
    ).toThrow();
    expect(() =>
      decode({
        productTypeRef,
        revision: 2,
        rules: [
          {
            attributeDefinitionRef: { ...material, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            level: 'PRODUCT',
            required: true,
          },
        ],
      }),
    ).toThrow();
  });
});
