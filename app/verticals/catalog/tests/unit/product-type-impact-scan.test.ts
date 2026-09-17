import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ProductTypeImpactScanIncomplete,
  productTypeImpactRevisionToken,
} from '../../src/persistence/product-type-impact-scan.ts';

const basis = {
  candidateRules: [{ attributeDefinitionId: 'capacity', level: 'PRODUCT' as const, required: true }],
  evidence: [
    {
      assignmentRevision: 2,
      axisRevisions: [],
      productId: 'p1',
      productRevision: 3,
      valueSetRevisions: [
        {
          attributeDefinitionId: 'capacity',
          revision: 2,
          state: 'SET',
          valid: true,
          validitySourceRevisionToken: 'definition-3:value-2',
          variantId: null,
        },
      ],
      variantRevisions: [{ revision: 1, variantId: 'v1' }],
    },
  ],
  openSelectionRefs: [{ productId: 'p1', selectionId: 's1', variantId: 'v1' }],
  preview: { affectedProductIds: ['p1'], requiresExplicitRemediation: true, subjects: [] },
  productTypeId: 't1',
  selectionRevisionToken: 'selection-current-1',
  sourceRevision: 4,
  sourceRevisionId: 'r4',
  tenantId: 'tenant-1',
};

describe('Product Type impact scan basis', () => {
  it('binds direct Product, Variant, and open selection revisions deterministically', () => {
    const token = productTypeImpactRevisionToken(basis);
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(productTypeImpactRevisionToken(basis)).toBe(token);
    const [firstEvidence] = basis.evidence;
    if (firstEvidence === undefined) {
      throw new Error('Test fixture requires evidence');
    }
    expect(productTypeImpactRevisionToken({ ...basis, evidence: [{ ...firstEvidence, productRevision: 4 }] })).not.toBe(
      token,
    );
    expect(productTypeImpactRevisionToken({ ...basis, selectionRevisionToken: 'selection-current-2' })).not.toBe(token);
    expect(productTypeImpactRevisionToken({ ...basis, tenantId: 'tenant-2' })).not.toBe(token);
    const [set] = firstEvidence.valueSetRevisions;
    if (set === undefined) {
      throw new Error('Test fixture requires a value set');
    }
    for (const changed of [
      { ...set, valid: false },
      { ...set, validitySourceRevisionToken: 'definition-4:value-2' },
      { ...set, revision: 3 },
      { ...set, variantId: 'v1' },
    ]) {
      expect(
        productTypeImpactRevisionToken({
          ...basis,
          evidence: [{ ...firstEvidence, valueSetRevisions: [changed] }],
        }),
      ).not.toBe(token);
    }
  });

  it('declares unknown #479 evidence as a typed incomplete outcome', () => {
    const failure = new ProductTypeImpactScanIncomplete({
      code: 'product_type_impact_scan_incomplete',
      reason: 'Open Catalog Selection population is unknown',
    });
    expect(Schema.is(ProductTypeImpactScanIncomplete)(failure)).toBe(true);
  });
});
