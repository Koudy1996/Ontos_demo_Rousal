import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { CreateProductUnitPayloadSchema } from '../../shared/actions/create-product-unit.ts';
import { ReviseProductUnitPayloadSchema } from '../../shared/actions/revise-product-unit.ts';
import { RetireProductUnitPayloadSchema } from '../../shared/actions/retire-product-unit.ts';
import { SetProductUnitTargetDivisibilityPayloadSchema } from '../../shared/actions/set-product-unit-target-divisibility.ts';
import { productUnitRuleRevisions, productUnits, productVariants, products } from '../../src/database/schema.ts';
import { productUnitPersistenceServiceFactory } from '../../src/actions/product-unit-action-support.ts';
import {
  productUnitPersistenceForScope,
  ProductUnitPersistenceUnavailable,
} from '../../src/persistence/product-unit-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const productId = '77777777-7777-4777-8777-777777777777';
const expectedSources = {
  product: {
    resourceRef: {
      moduleId: 'commerce.catalog',
      resourceId: productId,
      resourceType: 'commerce.catalog.product',
      tenantId,
    },
    revision: 2,
  },
  variant: {
    resourceRef: {
      moduleId: 'commerce.catalog',
      resourceId: variantId,
      resourceType: 'commerce.catalog.variant',
      tenantId,
    },
    revision: 3,
  },
};
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:product-unit-persistence-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'product-unit-persistence-test',
};
const unitRef = {
  moduleId: 'commerce.catalog',
  resourceId: unitId,
  resourceType: 'commerce.catalog.product-unit',
  tenantId,
};
const evidence = { actionInvocationId: '55555555-5555-4555-8555-555555555555', principalId };
const createPayload = Schema.decodeUnknownSync(CreateProductUnitPayloadSchema)({
  code: 'M',
  label: 'Metre',
  evidenceRefs: ['catalog-record:unit'],
  reason: 'Catalog unit approved',
  rule: { step: '0.01', rounding: 'UP' },
  unitRef,
});

describe('Product Unit persistence', () => {
  it.effect('creates one stable Unit and appends its first rule revision', () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const transaction = {
        select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: () => Effect.succeed([]) }) }) }) }),
        insert: (table: typeof productUnits | typeof productUnitRuleRevisions) => ({
          values: (value: typeof productUnits.$inferInsert | typeof productUnitRuleRevisions.$inferInsert) => {
            writes.push([table, value]);
            return table === productUnits ? { returning: () => Effect.succeed([value]) } : Effect.succeed([]);
          },
        }),
      };
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope);
      const result = yield* service.create({ ...evidence, payload: createPayload });
      expect(result._tag).toBe('created');
      expect(writes).toEqual([
        [productUnits, expect.objectContaining({ unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' })],
        [
          productUnitRuleRevisions,
          expect.objectContaining({
            unitId,
            revision: 1,
            step: '0.01',
            rounding: 'UP',
            changeKind: 'CREATED',
            evidenceRefs: ['catalog-record:unit'],
          }),
        ],
      ]);
    }),
  );

  it.effect('rejects cross-tenant identity before database access', () =>
    Effect.gen(function* () {
      const transaction = {
        select: () => {
          throw new Error('must not read');
        },
      };
      // @ts-expect-error No query should occur.
      const service = productUnitPersistenceForScope(transaction, scope);
      const result = yield* service.create({
        ...evidence,
        payload: {
          ...createPayload,
          unitRef: { ...createPayload.unitRef, tenantId: '66666666-6666-4666-8666-666666666666' },
        },
      });
      expect(result._tag).toBe('invalid');
    }),
  );

  it.effect('rejects stale rule revision without writes', () =>
    Effect.gen(function* () {
      const transaction = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () => Effect.succeed([{ unitId, tenantId, currentRuleRevision: 3, lifecycleState: 'ACTIVE' }]),
              }),
            }),
          }),
        }),
        update: () => {
          throw new Error('stale update');
        },
      };
      const payload = Schema.decodeUnknownSync(ReviseProductUnitPayloadSchema)({
        expectedCurrent: { unit: unitRef, revision: 2 },
        rule: { step: '0.1', rounding: 'DOWN' },
        reason: 'Revised precision',
        evidenceRefs: ['record:2'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope);
      const result = yield* service.revise({ ...evidence, payload });
      expect(result).toEqual({ _tag: 'stale', actualRevision: 3 });
    }),
  );

  it.effect('retires without changing the prior exact step and rounding', () =>
    Effect.gen(function* () {
      const writes: unknown[] = [];
      const current = { unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' };
      const transaction = {
        select: () => ({
          from: (table: unknown) => ({
            where: () =>
              table === productUnits
                ? { for: () => ({ limit: () => Effect.succeed([current]) }) }
                : { limit: () => Effect.succeed([{ unitId, tenantId, revision: 1, step: '0.01', rounding: 'UP' }]) },
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Effect.succeed([{ ...current, currentRuleRevision: 2, lifecycleState: 'RETIRED' }]),
            }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (value: unknown) => {
            writes.push([table, value]);
            return Effect.succeed([]);
          },
        }),
      };
      const payload = Schema.decodeUnknownSync(RetireProductUnitPayloadSchema)({
        expectedCurrent: { unit: unitRef, revision: 1 },
        reason: 'No longer sold',
        evidenceRefs: ['record:4'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope);
      const result = yield* service.retire({ ...evidence, payload });
      expect(result._tag).toBe('retired');
      expect(writes).toEqual([
        [
          productUnitRuleRevisions,
          expect.objectContaining({
            revision: 2,
            lifecycleState: 'RETIRED',
            changeKind: 'RETIRED',
            step: '0.01',
            rounding: 'UP',
          }),
        ],
      ]);
    }),
  );

  it.effect('fails closed when Current target basis is absent', () =>
    Effect.gen(function* () {
      const transaction = {
        select: () => ({
          from: (table: unknown) => ({
            where: () =>
              table === productUnits
                ? {
                    for: () => ({
                      limit: () =>
                        Effect.succeed([{ unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' }]),
                    }),
                  }
                : { limit: () => Effect.succeed([{ unitId, tenantId, revision: 1, step: '0.01', rounding: 'UP' }]) },
          }),
        }),
        insert: () => {
          throw new Error('must not write');
        },
        update: () => {
          throw new Error('must not write');
        },
      };
      const payload = Schema.decodeUnknownSync(SetProductUnitTargetDivisibilityPayloadSchema)({
        target: { targetId: variantId, targetType: 'commerce.catalog.variant', tenantId, unit: unitRef },
        expectedSources,
        divisible: true,
        reason: 'Verified variant divisibility',
        evidenceRefs: ['record:3'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope);
      const error = yield* service.setTargetDivisibility({ ...evidence, payload }).pipe(Effect.flip);
      expect(Schema.is(ProductUnitPersistenceUnavailable)(error)).toBe(true);
    }),
  );

  it.effect('classifies a definitely invalid target basis without writing', () =>
    Effect.gen(function* () {
      const transaction = {
        select: () => ({
          from: (table: unknown) => ({
            where: () =>
              table === productUnits
                ? {
                    for: () => ({
                      limit: () =>
                        Effect.succeed([{ unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' }]),
                    }),
                  }
                : { limit: () => Effect.succeed([{ unitId, tenantId, revision: 1, step: '0.01', rounding: 'UP' }]) },
          }),
        }),
        insert: () => {
          throw new Error('must not write');
        },
        update: () => {
          throw new Error('must not write');
        },
      };
      const payload = Schema.decodeUnknownSync(SetProductUnitTargetDivisibilityPayloadSchema)({
        target: { targetId: variantId, targetType: 'commerce.catalog.variant', tenantId, unit: unitRef },
        expectedSources,
        divisible: true,
        reason: 'Verified variant divisibility',
        evidenceRefs: ['record:3'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope, { verify: () => Effect.succeed('invalid') });
      const result = yield* service.setTargetDivisibility({ ...evidence, payload });
      expect(result._tag).toBe('invalid');
    }),
  );

  it.effect('classifies stale source Current without writing', () =>
    Effect.gen(function* () {
      const transaction = {
        select: () => ({
          from: (table: unknown) => ({
            where: () =>
              table === productUnits
                ? {
                    for: () => ({
                      limit: () =>
                        Effect.succeed([{ unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' }]),
                    }),
                  }
                : { limit: () => Effect.succeed([{ unitId, tenantId, revision: 1, step: '0.01', rounding: 'UP' }]) },
          }),
        }),
        insert: () => {
          throw new Error('must not write');
        },
        update: () => {
          throw new Error('must not write');
        },
      };
      const payload = Schema.decodeUnknownSync(SetProductUnitTargetDivisibilityPayloadSchema)({
        target: { targetId: variantId, targetType: 'commerce.catalog.variant', tenantId, unit: unitRef },
        expectedSources,
        divisible: true,
        reason: 'Verified variant divisibility',
        evidenceRefs: ['record:3'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = productUnitPersistenceForScope(transaction, scope, { verify: () => Effect.succeed('stale') });
      const result = yield* service.setTargetDivisibility({ ...evidence, payload });
      expect(result._tag).toBe('stale');
    }),
  );

  it.effect('compares locked Product Current with caller expectation', () =>
    Effect.gen(function* () {
      const locked: unknown[] = [];
      const transaction = {
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              for: () => ({
                limit: () => {
                  locked.push(table);
                  if (table === productUnits)
                    return Effect.succeed([{ unitId, tenantId, currentRuleRevision: 1, lifecycleState: 'ACTIVE' }]);
                  if (table === productVariants)
                    return Effect.succeed([{ variantId, productId, lifecycleState: 'ACTIVE', currentRevision: 3 }]);
                  if (table === products)
                    return Effect.succeed([{ productId, lifecycleState: 'ACTIVE', currentRevision: 4 }]);
                  throw new Error('unexpected locked table');
                },
              }),
              limit: () => Effect.succeed([{ unitId, tenantId, revision: 1, step: '0.01', rounding: 'UP' }]),
            }),
          }),
        }),
        insert: () => {
          throw new Error('must not write');
        },
        update: () => {
          throw new Error('must not write');
        },
      };
      const payload = Schema.decodeUnknownSync(SetProductUnitTargetDivisibilityPayloadSchema)({
        target: { targetId: variantId, targetType: 'commerce.catalog.variant', tenantId, unit: unitRef },
        expectedSources,
        divisible: true,
        reason: 'Verified variant divisibility',
        evidenceRefs: ['record:3'],
      });
      // @ts-expect-error Mock implements only the exercised Drizzle chains.
      const service = yield* productUnitPersistenceServiceFactory(transaction, scope);
      const result = yield* service.setTargetDivisibility({ ...evidence, payload });
      expect(result._tag).toBe('stale');
      expect(locked).toEqual([productUnits, productVariants, products]);
    }),
  );
});
