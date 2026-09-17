import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ProductTypeCurrentBasisSchema,
  ProductTypeCurrentRulesRevisionSchema,
} from '../../shared/domain/product-type-rules.ts';
import { evaluateCurrentProductTypeReadiness } from '../../src/persistence/product-type-readiness-evaluator.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const typeRef = {
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
const definitionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '55555555-5555-4555-8555-555555555555',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
} as const;
const basis = Schema.decodeUnknownSync(ProductTypeCurrentBasisSchema)({
  currentRevision: 2,
  effectiveFrom: '2026-09-16T00:00:00.000Z',
  evaluatedAt: '2026-09-17T00:00:00.000Z',
  productTypeRef: typeRef,
  revision: 2,
  revisionId: '66666666-6666-4666-8666-666666666666',
});
const source = {
  assignmentRevision: 3,
  basis,
  productRef,
  rulesRevision: Schema.decodeUnknownSync(ProductTypeCurrentRulesRevisionSchema)({
    effectiveFrom: basis.effectiveFrom,
    productTypeRef: typeRef,
    revision: 2,
    revisionId: basis.revisionId,
    rules: [{ attributeDefinitionRef: definitionRef, level: 'VARIANT', required: true }],
  }),
  status: 'VERIFIED',
} as const;

describe('private Product Type readiness evaluation', () => {
  it('stays indeterminate without complete owner Product values', () => {
    expect(
      evaluateCurrentProductTypeReadiness({ productValues: [], source, variantRefs: [], variants: [] }),
    ).toMatchObject({ status: 'INDETERMINATE' });
  });

  it('names a missing required value on its own Variant and preserves exact revisions', () => {
    const result = evaluateCurrentProductTypeReadiness({
      productValues: [],
      productValueSource: { complete: true, revision: 7 },
      source,
      variantRefs: [variantRef],
      variants: [
        {
          effectiveValues: [
            {
              attributeDefinitionId: definitionRef.resourceId,
              result: { status: 'CURRENT', values: [], variantRevision: 5 },
            },
          ],
          variantRef,
        },
      ],
    });
    expect(result).toMatchObject({
      assignmentRevision: 3,
      productValueSourceRevision: 7,
      rules: { violations: [{ kind: 'MISSING_REQUIRED', variantId: variantRef.resourceId }] },
      rulesRevision: 2,
      status: 'INVALID',
      valueRevisions: [{ variantRevision: 5 }],
    });
  });

  it('reports an untyped partial result, never overall readiness', () => {
    expect(
      evaluateCurrentProductTypeReadiness({
        productValues: [],
        productValueSource: { complete: true, revision: 1 },
        source: { productRef, status: 'UNTYPED' },
        variantRefs: [],
        variants: [],
      }).status,
    ).toBe('UNTYPED_PARTIAL');
  });
});
