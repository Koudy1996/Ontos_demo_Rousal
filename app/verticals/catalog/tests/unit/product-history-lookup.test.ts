import { describe, expect, it } from 'effect-rstest';
import { Effect, Option, Schema } from 'effect';

import { ProductHistorySchema } from '../../shared/domain/product.ts';
import { ProductRevisionReferenceSchema } from '../../shared/domain/catalog-revision-reference.ts';
import { ReadHandlerNotFound } from '@app/core-runtime';
import { readProductHistory } from '../../src/api/product-history.read.ts';
import type { CatalogPersistence } from '../../src/persistence/catalog-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const revisionId = '33333333-3333-4333-8333-333333333333';
const actionInvocationId = '44444444-4444-4444-8444-444444444444';
const recordedAt = '2026-09-16T12:00:00.000Z';
const history = Schema.decodeUnknownSync(ProductHistorySchema)({
  historical: true,
  lifecycle: [],
  productRef,
  revisions: [
    {
      actionInvocationId,
      changeKind: 'CREATED',
      evidenceRefs: ['evidence:original'],
      lifecycle: 'DRAFT',
      name: 'Original name',
      productRef,
      reason: 'Created',
      recordedAt,
      revision: 1,
      revisionReference: { resourceRef: productRef, revision: 1, revisionId },
    },
  ],
});
const services: CatalogPersistence = {
  correct: () => Effect.die('unused'),
  create: () => Effect.die('unused'),
  getCreatedByInvocation: () => Effect.die('unused'),
  getCurrent: () => Effect.die('unused'),
  getHistory: () => Effect.succeed(Option.some(history)),
  reactivate: () => Effect.die('unused'),
  recoverCreateProduct: () => Effect.die('unused'),
  retire: () => Effect.die('unused'),
  update: () => Effect.die('unused'),
};
const firstReference = Schema.decodeUnknownSync(ProductRevisionReferenceSchema)({
  resourceRef: productRef,
  revision: 1,
  revisionId,
});

describe('governed Product historical lookup', () => {
  it.effect('returns the exact retained revision, not a Current replacement', () =>
    Effect.gen(function* foundRevision() {
      const response = yield* readProductHistory(
        {
          productRef,
          revisionReference: firstReference,
        },
        tenantId,
        services,
      );
      expect(response.lookup?.kind).toBe('FOUND');
      if (response.lookup?.kind === 'FOUND') {
        expect(response.lookup.evidence.retained).toMatchObject({
          historical: true,
          kind: 'PRODUCT',
          lifecycle: 'DRAFT',
          name: 'Original name',
        });
      }
    }),
  );

  it.effect('returns MISSING for an absent exact revision and rejects a foreign Tenant', () =>
    Effect.gen(function* missingRevision() {
      const response = yield* readProductHistory(
        {
          productRef,
          revisionReference: Schema.decodeUnknownSync(ProductRevisionReferenceSchema)({
            resourceRef: productRef,
            revision: 2,
            revisionId: '55555555-5555-4555-8555-555555555555',
          }),
        },
        tenantId,
        services,
      );
      expect(response.lookup?.kind).toBe('MISSING');
      const foreign = yield* readProductHistory(
        {
          productRef: { ...productRef, tenantId: '99999999-9999-4999-8999-999999999999' },
        },
        tenantId,
        services,
      ).pipe(Effect.catchTag('ReadHandlerNotFound', (error) => Effect.succeed(error)));
      expect(Schema.is(ReadHandlerNotFound)(foreign)).toBe(true);
    }),
  );
});
