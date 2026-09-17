import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { ProductTypeImpactBasisUnavailable } from '../../src/persistence/product-type-revise-persistence.ts';

describe('Product Type revision persistence boundary', () => {
  it('declares a typed fail-closed outcome while complete impact evidence is unavailable', () => {
    const failure = new ProductTypeImpactBasisUnavailable({
      code: 'product_type_impact_basis_unavailable',
      reason: 'Catalog cannot yet verify the complete Product and Variant impact basis',
    });
    expect(Schema.is(ProductTypeImpactBasisUnavailable)(failure)).toBe(true);
    expect(failure.code).toBe('product_type_impact_basis_unavailable');
  });
});
