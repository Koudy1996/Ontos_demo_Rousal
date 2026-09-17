import { describe, expect, it } from 'effect-rstest';
import { Effect, Option, Schema } from 'effect';
import { ActionAlreadyCommitted, ActionRuntime } from '@app/core-runtime';

import { CreateProductResultSchema } from '../../shared/actions/create-product.ts';
import { recoverCreateProduct } from '../../src/api/create-product-recovery.read.ts';
import type { CatalogPersistence } from '../../src/persistence/catalog-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const invocationId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const variantId = '55555555-5555-4555-8555-555555555555';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const result = Schema.decodeUnknownSync(CreateProductResultSchema)({
  product: {
    catalogReady: false,
    createdAt: '2026-09-17T10:00:00.000Z',
    lifecycle: 'DRAFT',
    name: 'Original',
    productRef,
    revision: 1,
    updatedAt: '2026-09-17T10:00:00.000Z',
    variants: [
      {
        lifecycle: 'WORK_IN_PROGRESS',
        productRef,
        variantId,
        variantRef: {
          moduleId: 'commerce.catalog',
          resourceId: variantId,
          resourceType: 'commerce.catalog.variant',
          tenantId,
        },
      },
    ],
  },
  variantId,
});
const scope = {
  authBindingId: '66666666-6666-4666-8666-666666666666',
  authContextRef: 'better-auth-session:test',
  authMethod: 'session' as const,
  correlationId: 'test',
  principalId,
  tenantId,
};
const services = (lookup: CatalogPersistence['getCreatedByInvocation']): CatalogPersistence => ({
  correct: () => Effect.die('unused'),
  create: () => Effect.die('unused'),
  getCreatedByInvocation: lookup,
  getCurrent: () => Effect.die('unused'),
  getHistory: () => Effect.die('unused'),
  reactivate: () => Effect.die('unused'),
  retire: () => Effect.die('unused'),
  update: () => Effect.die('unused'),
});

describe('create Product recovery', () => {
  it.effect('returns the original result only after Core confirms this principal committed the invocation', () =>
    Effect.gen(function* () {
      const runtime = {
        resolveActionCommit: () =>
          Effect.fail(
            new ActionAlreadyCommitted({ code: 'action_already_committed', invocationId, reason: 'committed' }),
          ),
        runAction: () => Effect.die('unused'),
      };
      const recovered = yield* recoverCreateProduct(
        { invocationId },
        {
          readKey: 'commerce.catalog.api.create-product-recovery',
          scope,
          services: services((id, principal) => {
            expect(id).toBe(invocationId);
            expect(principal).toBe(principalId);
            return Effect.succeed(Option.some(result));
          }),
        },
      ).pipe(Effect.provideService(ActionRuntime, runtime));
      expect(recovered).toEqual(result);
    }),
  );

  it.effect('does not read Catalog while the Core commit is still open', () =>
    Effect.gen(function* () {
      const runtime = {
        resolveActionCommit: () => Effect.succeed({ _tag: 'ActionCommitOpen' as const, invocationId }),
        runAction: () => Effect.die('unused'),
      };
      const failure = yield* recoverCreateProduct(
        { invocationId },
        {
          readKey: 'commerce.catalog.api.create-product-recovery',
          scope,
          services: services(() => Effect.die('must not read before commit')),
        },
      ).pipe(Effect.provideService(ActionRuntime, runtime), Effect.flip);
      expect(failure._tag).toBe('ReadHandlerUnavailable');
    }),
  );
});
