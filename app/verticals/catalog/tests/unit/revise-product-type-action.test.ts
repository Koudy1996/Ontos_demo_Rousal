import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  handleReviseProductType,
  ReviseProductTypePayloadSchema,
  ReviseProductTypeStaleBasisSchema,
  reviseProductTypeAction,
} from '../../src/actions/revise-product-type.action.ts';
import type { ProductTypeRevisePersistence } from '../../src/persistence/product-type-revise-persistence.ts';
import { ProductTypeImpactBasisUnavailable } from '../../src/persistence/product-type-revise-persistence.ts';
import { CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const productTypeRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product-type',
  tenantId,
} as const;
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const attributeDefinitionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '55555555-5555-4555-8555-555555555555',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
} as const;
const payload = Schema.decodeUnknownSync(ReviseProductTypePayloadSchema)({
  effectiveFrom: '2026-09-17T10:00:00.000Z',
  expectedCurrentRevision: 1,
  impactBasisToken: 'a'.repeat(64),
  productTypeRef,
  proposedRules: [{ attributeDefinitionRef, level: 'PRODUCT', required: true }],
  unresolvedProductRefs: [productRef],
});
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:revise-product-type-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'revise-product-type-test',
};

const contextWith = (
  revise: ProductTypeRevisePersistence['revise'],
  accessed: { readonly targetResourceId: string }[] = [],
): ActionHandlerContext<Readonly<Record<string, never>>, ProductTypeRevisePersistence> => ({
  actionInvocationId: '66666666-6666-4666-8666-666666666666',
  addDomainEvent: () => Effect.succeed(Object.create(null)),
  addOutboxMessage: () => Effect.void,
  recordAuditEvidence: () => Effect.void,
  recordDataAccess: (evidence) =>
    Effect.sync(() => {
      accessed.push({ targetResourceId: evidence.targetResourceId ?? '' });
    }),
  scope,
  services: { revise },
});

describe('Revise Product Type Action contract', () => {
  it('requires an exact revision and owner-issued preview basis', () => {
    const decode = Schema.decodeUnknownSync(ReviseProductTypePayloadSchema);
    expect(decode(payload).expectedCurrentRevision).toBe(1);
    expect(() => decode({ ...payload, expectedCurrentRevision: 0 })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: '' })).toThrow();
    expect(() => decode({ ...payload, impactBasisToken: '77777777-7777-4777-8777-777777777777' })).toThrow();
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
        unresolvedProductRefs: [{ ...productRef, tenantId: '88888888-8888-4888-8888-888888888888' }],
      }),
    ).toThrow();
  });

  it.effect('passes trusted identity and the exact reviewed intent to owner persistence', () =>
    Effect.gen(function* handoff() {
      const accessed: { readonly targetResourceId: string }[] = [];
      const context = contextWith(
        (input) =>
          Effect.sync(() => {
            expect(input).toMatchObject({
              actionInvocationId: context.actionInvocationId,
              effectiveFrom: payload.effectiveFrom,
              expectedCurrentRevision: payload.expectedCurrentRevision,
              impactBasisToken: payload.impactBasisToken,
              principalId,
              productTypeRef,
              proposedRules: payload.proposedRules,
              unresolvedProductRefs: payload.unresolvedProductRefs,
            });
            return {
              _tag: 'revised' as const,
              result: Schema.decodeUnknownSync(reviseProductTypeAction.descriptor.resultSchema)({
                effectiveFrom: payload.effectiveFrom,
                productTypeRef,
                revision: 2,
                unresolvedProductRefs: [productRef],
              }),
            };
          }),
        accessed,
      );
      expect(yield* handleReviseProductType(payload, context)).toMatchObject({
        revision: 2,
        unresolvedProductRefs: [productRef],
      });
      expect(accessed).toEqual([{ targetResourceId: productTypeRef.resourceId }]);
    }),
  );

  it.effect('maps an absent or changed owner basis to the declared stale conflict', () =>
    Effect.gen(function* staleOwnerBasis() {
      const failure = yield* Effect.flip(
        handleReviseProductType(
          payload,
          contextWith(() => Effect.succeed({ _tag: 'stale_basis', reason: 'Cart population changed' })),
        ),
      );
      expect(Schema.is(ReviseProductTypeStaleBasisSchema)(failure)).toBe(true);
      expect(failure).toMatchObject({ code: 'product_type_stale_basis', reason: 'Cart population changed' });
    }),
  );

  it.effect('preserves unavailable owner evidence as a typed retryable domain failure', () =>
    Effect.gen(function* unavailableOwnerBasis() {
      const failure = new ProductTypeImpactBasisUnavailable({
        code: 'product_type_impact_basis_unavailable',
        reason: 'Cart open-selection population is unavailable',
      });
      const actual = yield* Effect.flip(
        handleReviseProductType(
          payload,
          contextWith(() => Effect.fail(failure)),
        ),
      );
      expect(actual).toBe(failure);
      expect(Schema.is(reviseProductTypeAction.descriptor.domainErrorSchema)(actual)).toBe(true);
    }),
  );

  it('declares stale basis and owner/persistence unavailability under the Action lifecycle', () => {
    const { descriptor } = reviseProductTypeAction;
    expect(descriptor.idempotency).toBe('required');
    expect(descriptor.entrypoint.authorization).toEqual({
      kind: 'action_execution',
      provisioning: 'explicit',
    });
    expect(
      Schema.is(descriptor.domainErrorSchema)(
        ReviseProductTypeStaleBasisSchema.make({
          code: 'product_type_stale_basis',
          reason: 'Current population changed',
        }),
      ),
    ).toBe(true);
    expect(
      Schema.is(descriptor.domainErrorSchema)(
        new CatalogPersistenceUnavailable({
          code: 'catalog_persistence_unavailable',
          reason: 'Catalog persistence unavailable',
        }),
      ),
    ).toBe(true);
  });
});
