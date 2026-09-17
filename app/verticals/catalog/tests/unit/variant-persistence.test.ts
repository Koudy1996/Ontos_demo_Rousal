import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Match, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  manufacturerRelations,
  productVariantRevisions,
  productVariants,
  products,
} from '../../src/database/schema.ts';
import {
  variantPersistenceForScope,
  VariantCurrentBasisUnavailable,
} from '../../src/persistence/variant-persistence.ts';

const tenantId = '00000000-0000-4000-8000-000000000001';
const productId = '00000000-0000-4000-8000-000000000002';
const variantId = '00000000-0000-4000-8000-000000000003';
const principalId = '00000000-0000-4000-8000-000000000004';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:variant-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'variant-test',
};
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: variantId,
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const evidence = {
  actionInvocationId: '00000000-0000-4000-8000-000000000005',
  evidenceRefs: ['catalog-record:1'],
  principalId,
  reason: 'Verified catalog record',
};
const row = {
  combinationAxisRevision: null,
  combinationKey: null,
  currentRevision: 1,
  lifecycleState: 'WORK_IN_PROGRESS',
  productId,
  tenantId,
  variantId,
};
const lockedRow = <T>(value: T) => ({ where: () => ({ for: () => ({ limit: () => Effect.succeed([value]) }) }) });
const returnedRow = <T>(value: T) => ({ where: () => ({ returning: () => Effect.succeed([value]) }) });

describe('Variant persistence', () => {
  it.effect('creates a draft with an immutable initial revision, never an invented Current combination', () =>
    Effect.gen(function* createDraft() {
      const writes: unknown[] = [];
      const transaction = {
        insert: (table: typeof productVariants | typeof productVariantRevisions) => ({
          values: (value: typeof productVariants.$inferInsert | typeof productVariantRevisions.$inferInsert) => {
            writes.push([table, value]);
            return table === productVariants ? { returning: () => Effect.succeed([row]) } : Effect.succeed([]);
          },
        }),
        select: () => ({
          from: (table: typeof products | typeof manufacturerRelations) =>
            table === products
              ? lockedRow({ ...row, currentRevision: 4 })
              : { where: () => ({ for: () => ({ pipe: () => Effect.succeed([]) }) }) },
        }),
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = variantPersistenceForScope(transaction, scope);
      const result = yield* service.create({ ...evidence, expectedProductRevision: 4, productRef, variantRef });
      expect(
        Match.value(result).pipe(
          Match.tag('created', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(writes).toEqual([
        [productVariants, expect.objectContaining({ lifecycleState: 'WORK_IN_PROGRESS', variantId })],
        [
          productVariantRevisions,
          expect.objectContaining({
            changeKind: 'CREATED',
            combinationAxisRevision: null,
            combinationKey: null,
            evidenceRefs: evidence.evidenceRefs,
            productId,
            revision: 1,
          }),
        ],
      ]);
    }),
  );

  it.effect('rejects a new exact form under a current Product-wide manufacturer assertion without writing', () =>
    Effect.gen(function* rejectUnverifiedManufacturerScope() {
      const transaction = {
        insert: () => {
          throw new Error('manufacturer scope conflict must not write');
        },
        select: () => ({
          from: (table: typeof products | typeof manufacturerRelations) =>
            table === products
              ? lockedRow({ ...row, currentRevision: 4 })
              : {
                  where: () => ({
                    for: () => ({
                      pipe: () =>
                        Effect.succeed([
                          { disposition: 'CONFIRMED', effectiveTo: null, productId, tenantId, variantId: null },
                        ]),
                    }),
                  }),
                },
        }),
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = variantPersistenceForScope(transaction, scope);
      const outcome = yield* service.create({ ...evidence, expectedProductRevision: 4, productRef, variantRef });
      expect(outcome).toEqual({ _tag: 'identity_conflict' });
    }),
  );

  it.effect('refuses reactivation without authoritative effective axes and Current proof', () =>
    Effect.gen(function* rejectUnverifiedReactivate() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) =>
            lockedRow(
              table === productVariants ? { ...row, lifecycleState: 'RETIRED' } : { ...row, lifecycleState: 'ACTIVE' },
            ),
        }),
        update: () => {
          throw new Error('reactivation must not write without Current basis');
        },
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = variantPersistenceForScope(transaction, scope);
      const result = yield* service.reactivate({ ...evidence, expectedRevision: 1, variantRef }).pipe(Effect.flip);
      expect(Schema.is(VariantCurrentBasisUnavailable)(result)).toBe(true);
    }),
  );

  it.effect('retires the targeted Variant and appends its lifecycle revision', () =>
    Effect.gen(function* retireVariant() {
      const revisions: unknown[] = [];
      const transaction = {
        insert: (table: typeof productVariantRevisions) => {
          expect(table).toBe(productVariantRevisions);
          return {
            values: (value: typeof productVariantRevisions.$inferInsert) => {
              revisions.push(value);
              return Effect.succeed([]);
            },
          };
        },
        select: () => ({
          from: (table: typeof productVariants) => {
            expect(table).toBe(productVariants);
            return lockedRow({
              ...row,
              combinationAxisRevision: 3,
              combinationKey: 'a'.repeat(64),
              lifecycleState: 'ACTIVE',
            });
          },
        }),
        update: (table: typeof productVariants) => {
          expect(table).toBe(productVariants);
          return {
            set: (values: Partial<typeof productVariants.$inferInsert>) => returnedRow({ ...row, ...values }),
          };
        },
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = variantPersistenceForScope(transaction, scope);
      const outcome = yield* service.retire({ ...evidence, expectedRevision: 1, variantRef });
      expect(
        Match.value(outcome).pipe(
          Match.tag('retired', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(revisions).toEqual([
        expect.objectContaining({
          changeKind: 'LIFECYCLE',
          combinationAxisRevision: null,
          combinationKey: null,
          lifecycleState: 'RETIRED',
          productId,
          revision: 2,
          variantId,
        }),
      ]);
    }),
  );

  it.effect('rejects cross-tenant draft creation before querying or writing', () =>
    Effect.gen(function* rejectOtherTenant() {
      const transaction = new Proxy(
        {},
        {
          get: () => {
            throw new Error('transaction touched');
          },
        },
      );
      // @ts-expect-error An uncallable transaction proves the tenant guard executes first.
      const service = variantPersistenceForScope(transaction, scope);
      const outcome = yield* service.create({
        ...evidence,
        expectedProductRevision: 1,
        productRef: { ...productRef, tenantId: '00000000-0000-4000-8000-000000000099' },
        variantRef,
      });
      expect(
        Match.value(outcome).pipe(
          Match.tag('invalid_change', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
    }),
  );
});
