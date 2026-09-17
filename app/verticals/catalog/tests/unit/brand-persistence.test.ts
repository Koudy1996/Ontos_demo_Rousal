import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { brandPersistenceForScope, BrandPersistenceUnavailable } from '../../src/persistence/brand-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const brandRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.brand',
  tenantId,
} as const;
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:brand-persistence-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'brand-persistence-test',
};
const evidence = {
  actionInvocationId: '55555555-5555-4555-8555-555555555555',
  principalId,
};
const reason = 'Verified continuation';
const evidenceRefs = ['catalog-record:brand'] as const;

describe('Brand persistence without relational substrate', () => {
  it.effect('fails all Brand and Product Brand mutations without issuing a database write', () =>
    Effect.gen(function* failClosed() {
      const transaction = {
        insert: () => {
          throw new Error('must not write');
        },
        select: () => {
          throw new Error('must not query');
        },
        update: () => {
          throw new Error('must not write');
        },
      };
      // @ts-expect-error No Drizzle operation should be used before the Brand schema exists.
      const service = brandPersistenceForScope(transaction, scope);
      const brandOperations = [
        service.create({ ...evidence, payload: { brandRef, evidenceRefs, name: 'Alfa', reason } }),
        service.rename({
          ...evidence,
          payload: { brandRef, evidenceRefs, expectedRevision: 1, name: 'Alfa Home', reason },
        }),
        service.retire({ ...evidence, payload: { brandRef, evidenceRefs, expectedRevision: 1, reason } }),
        service.reactivate({ ...evidence, payload: { brandRef, evidenceRefs, expectedRevision: 1, reason } }),
      ];
      for (const operation of brandOperations) {
        const failure = yield* operation.pipe(Effect.flip);
        expect(Schema.is(BrandPersistenceUnavailable)(failure)).toBe(true);
      }
      const productFailure = yield* service
        .setProductBrand({
          ...evidence,
          payload: { assignment: { brandRef, kind: 'brand' }, evidenceRefs, expectedRevision: 1, productRef, reason },
        })
        .pipe(Effect.flip);
      expect(Schema.is(BrandPersistenceUnavailable)(productFailure)).toBe(true);
    }),
  );
});
