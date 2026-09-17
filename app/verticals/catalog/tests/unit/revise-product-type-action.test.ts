import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  ReviseProductTypeNotImplemented,
  ReviseProductTypePayloadSchema,
  ReviseProductTypeStaleBasisSchema,
  reviseProductTypeAction,
} from '../../src/actions/revise-product-type.action.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productTypeRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product-type',
  tenantId,
} as const;
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const attributeDefinitionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
} as const;
const payload = {
  effectiveFrom: '2026-09-17T10:00:00.000Z',
  expectedCurrentRevision: 1,
  impactBasisToken: 'a'.repeat(64),
  productTypeRef,
  proposedRules: [{ attributeDefinitionRef, level: 'PRODUCT', required: true }],
  unresolvedProductRefs: [productRef],
} as const;

describe('Revise Product Type Action contract', () => {
  it('requires an exact revision and owner-issued preview basis', () => {
    const decode = Schema.decodeUnknownSync(ReviseProductTypePayloadSchema);
    expect(decode(payload).expectedCurrentRevision).toBe(1);
    expect(() => decode({ ...payload, expectedCurrentRevision: 0 })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: '' })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: '55555555-5555-4555-8555-555555555555' })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: 'A'.repeat(64) })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: 'a'.repeat(63) })).toThrow();
    expect(() => decode({ ...payload, effectiveFrom: 'tomorrow' })).toThrow();
  });

  it('rejects cross-tenant and duplicate rule/debt references', () => {
    const decode = Schema.decodeUnknownSync(ReviseProductTypePayloadSchema);
    expect(() => decode({ ...payload, proposedRules: [...payload.proposedRules, ...payload.proposedRules] })).toThrow();
    expect(() => decode({ ...payload, unresolvedProductRefs: [productRef, productRef] })).toThrow();
    expect(() =>
      decode({
        ...payload,
        unresolvedProductRefs: [{ ...productRef, tenantId: '66666666-6666-4666-8666-666666666666' }],
      }),
    ).toThrow();
  });

  it('declares stale basis distinctly while remaining fail-closed before persistence exists', () => {
    expect(reviseProductTypeAction.descriptor.idempotency).toBe('required');
    expect(reviseProductTypeAction.descriptor.entrypoint.authorization).toEqual({
      kind: 'action_execution',
      provisioning: 'explicit',
    });
    expect(
      Schema.is(ReviseProductTypeStaleBasisSchema)({
        _tag: 'ReviseProductTypeStaleBasis',
        code: 'product_type_stale_basis',
        reason: 'Current population changed',
      }),
    ).toBe(true);
    expect(
      Schema.is(ReviseProductTypeNotImplemented)(
        new ReviseProductTypeNotImplemented({
          code: 'action_not_implemented',
          reason: 'Persistence is not connected',
        }),
      ),
    ).toBe(true);
  });
});
