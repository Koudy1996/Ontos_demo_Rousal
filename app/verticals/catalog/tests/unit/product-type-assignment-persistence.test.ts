import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ProductTypeAssignmentRejected,
  emptyDraftProductTypeImpactBasis,
} from '../../src/persistence/product-type-assignment-persistence.ts';

const basis = {
  currentProductTypeId: null,
  currentProductTypeRevision: null,
  nextProductTypeId: '33333333-3333-4333-8333-333333333333',
  nextProductTypeRevision: 1,
  productId: '22222222-2222-4222-8222-222222222222',
  productRevision: 1,
  tenantId: '11111111-1111-4111-8111-111111111111',
};

describe('Product Type empty Draft impact basis', () => {
  it('binds the preview to Product, Tenant, current assignment, target, and target revision', () => {
    const token = emptyDraftProductTypeImpactBasis(basis);
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(emptyDraftProductTypeImpactBasis(basis)).toBe(token);
    expect(emptyDraftProductTypeImpactBasis({ ...basis, productRevision: 2 })).not.toBe(token);
    expect(emptyDraftProductTypeImpactBasis({ ...basis, nextProductTypeRevision: 2 })).not.toBe(token);
    expect(emptyDraftProductTypeImpactBasis({ ...basis, currentProductTypeId: basis.nextProductTypeId })).not.toBe(
      token,
    );
    expect(emptyDraftProductTypeImpactBasis({ ...basis, currentProductTypeRevision: 2 })).not.toBe(token);
    expect(emptyDraftProductTypeImpactBasis({ ...basis, nextProductTypeId: null })).not.toBe(token);
    expect(emptyDraftProductTypeImpactBasis({ ...basis, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).not.toBe(
      token,
    );
  });

  it('has a typed stale-basis rejection', () => {
    const failure = new ProductTypeAssignmentRejected({
      code: 'product_type_stale_impact_basis',
      reason: 'No authoritative impact basis',
    });
    expect(Schema.is(ProductTypeAssignmentRejected)(failure)).toBe(true);
  });
});
