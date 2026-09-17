import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { productVariants, products } from '../../src/database/schema.ts';
import { catalogPersistenceForScope } from '../../src/persistence/catalog-persistence.ts';
import { CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

const tenantId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000002';
const variantId = '00000000-0000-4000-8000-000000000003';
const principalId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-09-17T10:00:00.000Z');
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:product-update-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'product-update-test',
};

describe('Product update Variant activation', () => {
  it.effect('fails closed before any write when draft Current basis is unverified', () =>
    Effect.gen(function* rejectUnverifiedActivation() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) => ({
            where: () => ({
              limit: () =>
                Effect.succeed([
                  {
                    createdAt: now,
                    currentRevision: 1,
                    description: null,
                    lifecycleState: 'DRAFT',
                    name: 'Product',
                    productId,
                    updatedAt: now,
                  },
                ]),
              orderBy: () => {
                expect(table).toBe(productVariants);
                return Effect.succeed([
                  {
                    createdAt: now,
                    lifecycleState: 'WORK_IN_PROGRESS',
                    productId,
                    tenantId,
                    variantId,
                  },
                ]);
              },
            }),
          }),
        }),
        update: () => {
          throw new Error('unverified activation must not write');
        },
        insert: () => {
          throw new Error('unverified activation must not append a revision');
        },
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const persistence = yield* catalogPersistenceForScope(transaction, scope);
      const error = yield* persistence
        .update({
          actionInvocationId: '00000000-0000-4000-8000-000000000005',
          activateVariantId: variantId,
          expectedRevision: 1,
          principalId,
          productId,
          reason: 'Activate draft',
          targetLifecycle: 'ACTIVE',
          tenantId,
        })
        .pipe(Effect.flip);
      expect(Schema.is(CatalogPersistenceUnavailable)(error)).toBe(true);
    }),
  );
});
