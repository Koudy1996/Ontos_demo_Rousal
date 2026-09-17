import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { products } from '../../src/database/schema.ts';
import type { productVariants } from '../../src/database/schema.ts';
import { catalogSelectionCurrentBasisForScope } from '../../src/persistence/catalog-selection-current-basis.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:selection-current-test:run:1',
    authMethod: 'system',
    principalId: '44444444-4444-4444-8444-444444444444',
    tenantId,
  }),
  correlationId: 'selection-current-test',
};
const selection = {
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: productId,
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: variantId,
    resourceType: 'commerce.catalog.variant',
    tenantId,
  },
} as const;
const selected = (rows: readonly object[]) => ({ where: () => ({ limit: () => Effect.succeed(rows) }) });

describe('Catalog Selection Current basis', () => {
  it.effect('never queries a foreign tenant selection', () =>
    Effect.gen(function* foreignTenant() {
      const transaction = {
        select: () => {
          throw new Error('foreign query');
        },
      };
      // @ts-expect-error The deliberately forbidden query path needs no Drizzle methods.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({
        purpose: 'PURCHASE_ACCEPTANCE',
        selection: {
          ...selection,
          productRef: { ...selection.productRef, tenantId: '55555555-5555-4555-8555-555555555555' },
        },
      });
      expect(result.status).toBe('INDETERMINATE');
      expect(result.basis).toEqual([]);
    }),
  );

  it.effect('retains exact owner revisions but does not invent indirect proof', () =>
    Effect.gen(function* partialBasis() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) =>
            selected(
              table === products
                ? [{ lifecycleState: 'ACTIVE', revision: 4 }]
                : [{ lifecycleState: 'ACTIVE', productId, revision: 7 }],
            ),
        }),
      };
      // @ts-expect-error Only the two exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection });
      expect(result.status).toBe('INDETERMINATE');
      expect(result.basis.map(({ role, source }) => [role, source.revision])).toEqual([
        ['PRODUCT', 4],
        ['VARIANT', 7],
      ]);
      expect(result.source).toBe('CATALOG_OWNER_CURRENT_READ');
    }),
  );

  it.effect('rejects a Variant owned by a different Product without membership proof', () =>
    Effect.gen(function* wrongProduct() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) =>
            selected(
              table === products
                ? [{ lifecycleState: 'ACTIVE', revision: 4 }]
                : [{ lifecycleState: 'ACTIVE', productId: '66666666-6666-4666-8666-666666666666', revision: 7 }],
            ),
        }),
      };
      // @ts-expect-error Only the two exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection });
      expect(result.status).toBe('INVALID');
      expect(result.basis.map(({ role }) => role)).toEqual(['PRODUCT']);
    }),
  );
});
