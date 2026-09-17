import { describe, expect, it } from 'effect-rstest';

import {
  previewProductTypeImpact,
  resolveCurrentProductTypeRevision,
} from '../../shared/domain/product-type-impact.ts';

const shelf = {
  productId: 'shelf',
  values: [{ attributeDefinitionId: 'width' }],
  variantAxes: ['color'],
  variants: [{ values: [{ attributeDefinitionId: 'color' }], variantId: 'oak' }],
} as const;

describe('Product Type impact preview', () => {
  it('finds missing required values without fabricating them', () => {
    const preview = previewProductTypeImpact(
      [shelf],
      [
        { attributeDefinitionId: 'width', level: 'PRODUCT', required: false },
        { attributeDefinitionId: 'capacity', level: 'PRODUCT', required: true },
        { attributeDefinitionId: 'color', level: 'VARIANT', required: true },
      ],
    );
    expect(preview.affectedProductIds).toEqual(['shelf']);
    expect(preview.subjects[0]?.missingRequired).toEqual(['capacity']);
    expect(preview.subjects[0]?.catalogReadyForAffectedUse).toBe(false);
    expect(shelf.values).toEqual([{ attributeDefinitionId: 'width' }]);
  });

  it('does not reinterpret similarly named or otherwise disallowed values', () => {
    const preview = previewProductTypeImpact(
      [shelf],
      [
        { attributeDefinitionId: 'bracket-width', level: 'PRODUCT', required: true },
        { attributeDefinitionId: 'color', level: 'VARIANT', required: false },
      ],
    );
    expect(preview.subjects[0]?.missingRequired).toEqual(['bracket-width']);
    expect(preview.subjects[0]?.disallowedCurrentValues).toEqual(['width']);
    expect(preview.requiresExplicitRemediation).toBe(true);
  });

  it('treats removal as affecting structured values and axes', () => {
    const preview = previewProductTypeImpact([shelf], null);
    expect(preview.subjects[0]?.disallowedCurrentValues).toEqual(['width']);
    expect(preview.subjects[0]?.affectedVariantAxes).toEqual(['color']);
    expect(preview.subjects[1]?.disallowedCurrentValues).toEqual(['color']);
  });

  it('finds variant-level missing values independently', () => {
    const preview = previewProductTypeImpact(
      [shelf],
      [
        { attributeDefinitionId: 'width', level: 'PRODUCT', required: false },
        { attributeDefinitionId: 'color', level: 'VARIANT', required: true },
        { attributeDefinitionId: 'size', level: 'VARIANT', required: true },
      ],
    );
    expect(preview.subjects).toEqual([
      {
        affectedVariantAxes: [],
        catalogReadyForAffectedUse: false,
        disallowedCurrentValues: [],
        missingRequired: ['size'],
        productId: 'shelf',
        variantId: 'oak',
      },
    ]);
  });

  it('fails closed on overlapping effective revisions', () => {
    const revisions = [
      { effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null, revisionId: 'old' },
      { effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: null, revisionId: 'new' },
    ];
    expect(resolveCurrentProductTypeRevision(revisions, '2026-09-17T00:00:00Z')).toEqual({
      revisionIds: ['new', 'old'],
      status: 'AMBIGUOUS',
    });
    expect(resolveCurrentProductTypeRevision(revisions, '2025-12-31T00:00:00Z')).toEqual({ status: 'NONE' });
  });
});
