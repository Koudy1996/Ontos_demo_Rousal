import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  packageDefinitions,
  packageUnitDivisibility,
  productUnitRuleRevisions,
  productUnits,
  productVariants,
  products,
  variantUnitDivisibility,
} from '../../src/database/schema.ts';
import { catalogQuantityPreparationForScope } from '../../src/persistence/catalog-quantity-preparation.ts';
import { CatalogSelectionSchema } from '../../shared/domain/catalog-selection-evidence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const unitId = '44444444-4444-4444-8444-444444444444';
const packageId = '55555555-5555-4555-8555-555555555555';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:catalog-quantity-test:run:1',
    authMethod: 'system',
    principalId: '66666666-6666-4666-8666-666666666666',
    tenantId,
  }),
  correlationId: 'catalog-quantity-test',
};
const selection = Schema.decodeUnknownSync(CatalogSelectionSchema)({
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
});

const rows = new Map<unknown, unknown>([
  [products, { currentRevision: 2, lifecycleState: 'ACTIVE', productId }],
  [productVariants, { currentRevision: 3, lifecycleState: 'ACTIVE', productId, variantId }],
  [
    packageDefinitions,
    {
      currentRevision: 4,
      lifecycleState: 'ACTIVE',
      optionState: 'ACTIVE',
      packageDefinitionId: packageId,
      productId,
      variantId,
    },
  ],
  [variantUnitDivisibility, { currentRevision: 5, divisible: true, unitId, variantId }],
  [packageUnitDivisibility, { currentRevision: 6, divisible: false, packageDefinitionId: packageId, unitId }],
  [productUnits, { currentRuleRevision: 7, lifecycleState: 'ACTIVE', unitId }],
  [productUnitRuleRevisions, { revision: 7, rounding: 'UP', step: '0.01', unitId }],
]);
const transactionFor = (overrides = new Map<unknown, unknown>()) => ({
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () =>
          Effect.succeed(
            overrides.has(table) ? (overrides.get(table) === null ? [] : [overrides.get(table)]) : [rows.get(table)],
          ),
      }),
    }),
  }),
});

describe('Catalog quantity preparation', () => {
  it.effect('normalizes exactly and retains current source revisions', () =>
    Effect.gen(function* () {
      // @ts-expect-error The mock provides only the read chains exercised here.
      const result = yield* catalogQuantityPreparationForScope(transactionFor(), scope).prepare({
        amount: '2.537',
        phase: 'PREPARE',
        selection,
      });
      expect(result.status).toBe('PREPARED');
      if (result.status === 'PREPARED') {
        expect(result.quantity).toMatchObject({
          changed: true,
          notice: 'ROUNDED',
          requested: '2.537',
          resulting: '2.54',
          unitRuleRevision: 7,
        });
        expect(result.sources).toMatchObject({
          product: { revision: 2 },
          targetDivisibilityRevision: 5,
          variant: { revision: 3 },
        });
      }
    }),
  );

  it.effect('rejects a fractional package count before rounding', () =>
    Effect.gen(function* () {
      const packageSelection = Schema.decodeUnknownSync(CatalogSelectionSchema)({
        ...selection,
        packageOption: {
          contentRevision: {
            resourceRef: {
              moduleId: 'commerce.catalog',
              resourceType: 'commerce.catalog.package-definition',
              resourceId: packageId,
              tenantId,
            },
            revision: 4,
          },
          optionRef: {
            moduleId: 'commerce.catalog',
            resourceType: 'commerce.catalog.package-definition',
            resourceId: packageId,
            tenantId,
          },
        },
      });
      // @ts-expect-error The mock provides only the read chains exercised here.
      const result = yield* catalogQuantityPreparationForScope(transactionFor(), scope).prepare({
        amount: '0.5',
        phase: 'PREPARE',
        selection: packageSelection,
      });
      expect(result.status).toBe('INVALID');
    }),
  );

  it.effect('returns stale when a candidate pins an older Unit rule', () =>
    Effect.gen(function* () {
      // @ts-expect-error The mock provides only the read chains exercised here.
      const result = yield* catalogQuantityPreparationForScope(transactionFor(), scope).prepare({
        amount: '2.53',
        expected: { productRevision: 2, variantRevision: 3, unitRuleRevision: 6, targetDivisibilityRevision: 5 },
        phase: 'APPROVED',
        selection,
      });
      expect(result.status).toBe('STALE');
    }),
  );
});
