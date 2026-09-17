import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { ProductTypeAssignmentRejected } from '../../src/persistence/product-type-assignment-persistence.ts';

describe('Product Type assignment safety boundary', () => {
  it('declares a typed stale-basis failure while governed preview and selection authority are absent', () => {
    const failure = new ProductTypeAssignmentRejected({
      code: 'product_type_stale_impact_basis',
      reason: 'A governed impact preview and Current selection basis are required',
    });
    expect(Schema.is(ProductTypeAssignmentRejected)(failure)).toBe(true);
    expect(failure.code).toBe('product_type_stale_impact_basis');
  });
});
