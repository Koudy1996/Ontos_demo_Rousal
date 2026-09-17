import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Match, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { packageContentRevisions, packageDefinitions } from '../../src/database/schema.ts';
import type { productVariants, products } from '../../src/database/schema.ts';
import {
  packageActivationPersistenceForScope,
  PackageActivationUnavailable,
} from '../../src/persistence/package-activation-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const packageDefinitionId = '55555555-5555-4555-8555-555555555555';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:package-activation-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'package-activation-test',
};
const input = {
  actionInvocationId: '77777777-7777-4777-8777-777777777777',
  evidenceRefs: ['catalog-record:verified-package'],
  expectedRevision: 1,
  packageDefinitionId,
  principalId,
  reason: 'Verified current package contents',
};
const definition = {
  currentRevision: 1,
  lifecycleState: 'DRAFT',
  optionState: 'NOT_SELECTABLE',
  packageDefinitionId,
  productId,
  tenantId,
  variantId,
};
const content = {
  amount: '10',
  configurationKey: null,
  effectiveAt: new Date('1960-01-01T00:00:00.000Z'),
  lifecycleState: 'DRAFT',
  lowerCount: null,
  lowerPackageDefinitionId: null,
  lowerRevision: null,
  productId,
  setCompositionResourceId: null,
  setCompositionRevision: null,
  unitResourceId: '66666666-6666-4666-8666-666666666666',
  unitResourceType: 'commerce.catalog.product-unit',
  variantId,
};
type Table = typeof packageDefinitions | typeof packageContentRevisions | typeof products | typeof productVariants;
type WriteValue = Partial<typeof packageDefinitions.$inferInsert> | typeof packageContentRevisions.$inferInsert;
const rows = (table: Table, overrides: { content?: typeof content; definition?: typeof definition }) => {
  if (table === packageDefinitions) {
    return [overrides.definition ?? definition];
  }
  if (table === packageContentRevisions) {
    return [overrides.content ?? content];
  }
  return [{ lifecycleState: 'ACTIVE' }];
};
const readLimit = (table: Table, overrides: { content?: typeof content; definition?: typeof definition }) =>
  Effect.succeed(rows(table, overrides));
const writeUpdate = (table: Table, writes: unknown[], value: WriteValue) => {
  writes.push([table, value]);
  return Effect.succeed([{ ...definition, currentRevision: 2 }]);
};
const queryFor = (table: Table, overrides: { content?: typeof content; definition?: typeof definition }) => ({
  where: () => ({ for: () => ({ limit: () => readLimit(table, overrides) }) }),
});
const updateFor = (table: Table, writes: unknown[]) => ({
  set: (value: WriteValue) => ({ where: () => ({ returning: () => writeUpdate(table, writes, value) }) }),
});
const fixture = (writes: unknown[], overrides: { content?: typeof content; definition?: typeof definition } = {}) => ({
  insert: (table: Table) => ({
    values: (value: WriteValue) => {
      writes.push([table, value]);
      return Effect.succeed([]);
    },
  }),
  select: () => ({ from: (table: Table) => queryFor(table, overrides) }),
  update: (table: Table) => updateFor(table, writes),
});

describe('Package Definition activation persistence', () => {
  it.effect('fails closed without selection impact proof before any write', () =>
    Effect.gen(function* noImpact() {
      const writes: unknown[] = [];
      // @ts-expect-error Mock covers only the exercised Drizzle chain.
      const service = packageActivationPersistenceForScope(fixture(writes), scope, {
        verify: () => Effect.succeed(true),
      });
      const error = yield* service.activate(input).pipe(Effect.flip);
      expect(Schema.is(PackageActivationUnavailable)(error)).toBe(true);
      expect(writes).toEqual([]);
    }),
  );

  it.effect('keeps the Draft content immutable and appends an Active revision without selecting the Option', () =>
    Effect.gen(function* activation() {
      const writes: unknown[] = [];
      const service = packageActivationPersistenceForScope(
        // @ts-expect-error Mock covers only the exercised Drizzle chain.
        fixture(writes),
        scope,
        { verify: () => Effect.succeed(true) },
        { verify: () => Effect.succeed(true) },
      );
      expect(
        Match.value(yield* service.activate(input)).pipe(
          Match.tag('activated', ({ revision }) => revision),
          Match.orElse(() => null),
        ),
      ).toBe(2);
      expect(writes).toEqual([
        [packageDefinitions, expect.objectContaining({ currentRevision: 2, lifecycleState: 'ACTIVE' })],
        [
          packageContentRevisions,
          expect.objectContaining({ amount: '10', lifecycleState: 'ACTIVE', lowerRevision: null, revision: 2 }),
        ],
      ]);
      expect(writes[0]).not.toEqual(expect.objectContaining({ optionState: 'ACTIVE' }));
    }),
  );

  it.effect('rejects stale, retired-parent, and unsafe-selection states without writes', () =>
    Effect.gen(function* rejects() {
      const writes: unknown[] = [];
      const service = packageActivationPersistenceForScope(
        // @ts-expect-error Mock covers only the exercised Drizzle chain.
        fixture(writes),
        scope,
        { verify: () => Effect.succeed(true) },
        { verify: () => Effect.succeed(false) },
      );
      expect(
        Match.value(yield* service.activate({ ...input, expectedRevision: 2 })).pipe(
          Match.tag('stale', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(
        Match.value(yield* service.activate(input)).pipe(
          Match.tag('invalid', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(writes).toEqual([]);
    }),
  );

  it.effect('refuses a pinned lower revision that is not active', () =>
    Effect.gen(function* inactiveLower() {
      const writes: unknown[] = [];
      const lowerContent = {
        ...content,
        lowerCount: '2',
        lowerPackageDefinitionId: '88888888-8888-4888-8888-888888888888',
        lowerRevision: 1,
      };
      const service = packageActivationPersistenceForScope(
        // @ts-expect-error Mock covers only the exercised Drizzle chain.
        fixture(writes, { content: lowerContent }),
        scope,
        { verify: () => Effect.succeed(true) },
        { verify: () => Effect.succeed(true) },
      );
      expect(
        Match.value(yield* service.activate(input)).pipe(
          Match.tag('invalid', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
      expect(writes).toEqual([]);
    }),
  );
});
