import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { AttributeDefinitionSchema } from '../../shared/domain/attribute-values.ts';
import { ProductVariantSchema } from '../../shared/domain/product.ts';
import { evaluateVariantAxes } from '../../shared/domain/variant-axes.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const anotherProductRef = { ...productRef, resourceId: '99999999-9999-4999-8999-999999999999' } as const;
const definition = Schema.decodeUnknownSync(AttributeDefinitionSchema)({
  label: 'Color',
  levels: ['VARIANT'],
  meaning: 'Actual color',
  multiplicity: 'SINGLE',
  ref: {
    moduleId: 'commerce.catalog',
    resourceId: '44444444-4444-4444-8444-444444444444',
    resourceType: 'commerce.catalog.attribute-definition',
    tenantId,
  },
  specialStates: ['UNKNOWN'],
  valueKind: 'CONTROLLED',
});
const variant = (id: string, owner: typeof productRef | typeof anotherProductRef = productRef, lifecycle = 'ACTIVE') =>
  Schema.decodeUnknownSync(ProductVariantSchema)({
    lifecycle,
    productRef: owner,
    variantId: id,
    variantRef: { moduleId: 'commerce.catalog', resourceId: id, resourceType: 'commerce.catalog.variant', tenantId },
  });
const white = {
  kind: 'CONTROLLED',
  valueRef: {
    moduleId: 'commerce.catalog',
    resourceId: '55555555-5555-4555-8555-555555555555',
    resourceType: 'commerce.catalog.controlled-attribute-value',
    tenantId,
  },
} as const;
const black = {
  kind: 'CONTROLLED',
  valueRef: { ...white.valueRef, resourceId: '66666666-6666-4666-8666-666666666666' },
} as const;
const values = (actual: typeof white | typeof black) =>
  [{ attributeDefinitionRef: definition.ref, values: [actual] }] as const;
const base = {
  axes: [{ attributeDefinitionRef: definition.ref }],
  definitions: [definition],
  isAllowedValue: () => true,
  productRef: variant('33333333-3333-4333-8333-333333333333').productRef,
  productTypeRules: [{ attributeDefinitionRef: definition.ref, level: 'VARIANT', required: false }] as const,
};

describe('Variant axes and exact combinations', () => {
  it('allows only recorded, distinct active combinations and no Cartesian expansion', () => {
    const result = evaluateVariantAxes({
      ...base,
      candidates: [
        { effectiveAxisValues: values(white), variant: variant('33333333-3333-4333-8333-333333333333') },
        { effectiveAxisValues: values(black), variant: variant('77777777-7777-4777-8777-777777777777') },
      ],
    });
    expect(result).toEqual({ issues: [], valid: true });
  });

  it('rejects an active duplicate regardless of Variant identity and ignores retired history', () => {
    const first = { effectiveAxisValues: values(white), variant: variant('33333333-3333-4333-8333-333333333333') };
    const second = { effectiveAxisValues: values(white), variant: variant('77777777-7777-4777-8777-777777777777') };
    expect(evaluateVariantAxes({ ...base, candidates: [first, second] }).issues).toContainEqual({
      conflictingVariantId: first.variant.variantRef.resourceId,
      kind: 'DUPLICATE_COMBINATION',
      variantId: second.variant.variantRef.resourceId,
    });
    expect(
      evaluateVariantAxes({
        ...base,
        candidates: [
          first,
          { ...second, variant: variant(second.variant.variantRef.resourceId, productRef, 'RETIRED') },
        ],
      }).valid,
    ).toBe(true);
  });

  it('distinguishes missing, invalid, and unverified values', () => {
    const active = variant('33333333-3333-4333-8333-333333333333');
    expect(
      evaluateVariantAxes({ ...base, candidates: [{ effectiveAxisValues: [], variant: active }] }).issues[0]?.kind,
    ).toBe('MISSING_AXIS');
    expect(
      evaluateVariantAxes({
        ...base,
        candidates: [{ effectiveAxisValues: values(white), variant: active }],
        isAllowedValue: () => false,
      }).issues[0]?.kind,
    ).toBe('INVALID_VALUE');
    expect(
      evaluateVariantAxes({
        axes: base.axes,
        candidates: [{ effectiveAxisValues: values(white), variant: active }],
        definitions: base.definitions,
        productRef: base.productRef,
        productTypeRules: base.productTypeRules,
      }).issues[0]?.kind,
    ).toBe('UNVERIFIABLE_VALUE');
    expect(
      evaluateVariantAxes({
        ...base,
        candidates: [
          {
            effectiveAxisValues: [
              { attributeDefinitionRef: definition.ref, values: [{ kind: 'SPECIAL', state: 'UNKNOWN' }] },
            ],
            variant: active,
          },
        ],
      }).issues[0]?.kind,
    ).toBe('INVALID_VALUE');
  });

  it('allows an axis-free singleton but detects a second indistinguishable active Variant', () => {
    const first = { effectiveAxisValues: [], variant: variant('33333333-3333-4333-8333-333333333333') };
    expect(evaluateVariantAxes({ ...base, axes: [], candidates: [first] }).valid).toBe(true);
    expect(
      evaluateVariantAxes({
        ...base,
        axes: [],
        candidates: [first, { effectiveAxisValues: [], variant: variant('77777777-7777-4777-8777-777777777777') }],
      }).issues[0]?.kind,
    ).toBe('DUPLICATE_COMBINATION');
  });

  it('keeps combinations Product-scoped and enforces axis applicability', () => {
    const other = variant('77777777-7777-4777-8777-777777777777', anotherProductRef);
    expect(
      evaluateVariantAxes({ ...base, candidates: [{ effectiveAxisValues: values(white), variant: other }] }).issues[0]
        ?.kind,
    ).toBe('WRONG_PRODUCT');
    expect(evaluateVariantAxes({ ...base, candidates: [], productTypeRules: [] }).issues[0]?.kind).toBe(
      'DISALLOWED_AXIS',
    );
  });
});
