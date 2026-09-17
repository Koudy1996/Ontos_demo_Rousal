import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Match, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { SetCompositionRevisionSchema } from '../../shared/domain/set-composition.ts';
import { setCompositions } from '../../src/database/schema.ts';
import type { productVariants, products } from '../../src/database/schema.ts';
import {
  setCompositionPersistenceForScope,
  SetCompositionPersistenceUnavailable,
} from '../../src/persistence/set-composition-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const compositionId = '44444444-4444-4444-8444-444444444444';
const principalId = '55555555-5555-4555-8555-555555555555';
const ref = (resourceType: string, resourceId: string) => ({
  moduleId: 'commerce.catalog',
  resourceId,
  resourceType: `commerce.catalog.${resourceType}`,
  tenantId,
});
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:set-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'set-test',
};
const revision = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
  components: [
    {
      componentId: '66666666-6666-4666-8666-666666666666',
      quantity: { amount: '1', unitRef: ref('product-unit', '77777777-7777-4777-8777-777777777777') },
      selection: {
        productRef: ref('product', '88888888-8888-4888-8888-888888888888'),
        variantRef: ref('variant', '99999999-9999-4999-8999-999999999999'),
      },
    },
    {
      componentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      quantity: { amount: '2', unitRef: ref('product-unit', '77777777-7777-4777-8777-777777777777') },
      selection: {
        productRef: ref('product', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        variantRef: ref('variant', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      },
    },
  ],
  productRef: ref('product', productId),
  provenance: { changeKind: 'INITIAL', evidenceRefs: ['catalog:verified'], reason: 'Initial fixed composition' },
  reference: { resourceRef: ref('set-composition', compositionId), revision: 1 },
  variantRef: ref('variant', variantId),
});
const input = {
  actingPrincipalId: principalId,
  actionInvocationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  effectiveFrom: new Date('2026-09-17T00:00:00.000Z'),
  expectedRevision: 0,
  lifecycleState: 'ACTIVE' as const,
  revision,
};
const selectedRows = (rows: readonly unknown[]) => ({
  where: () => ({ for: () => ({ limit: () => Effect.succeed(rows) }) }),
});

describe('Set composition persistence', () => {
  it.effect('fails closed without the owner Current-basis proof before any query or write', () =>
    Effect.gen(function* noProof() {
      const transaction = {
        insert: () => {
          throw new Error('No write allowed');
        },
        select: () => {
          throw new Error('No query allowed');
        },
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = setCompositionPersistenceForScope(transaction, scope);
      const error = yield* service.publish(input).pipe(Effect.flip);
      expect(Schema.is(SetCompositionPersistenceUnavailable)(error)).toBe(true);
    }),
  );

  it.effect('rejects cross-Tenant composition references before querying', () =>
    Effect.gen(function* crossTenant() {
      const transaction = {
        select: () => {
          throw new Error('No query allowed');
        },
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = setCompositionPersistenceForScope(transaction, scope, { verify: () => Effect.succeed(true) });
      const outcome = yield* service.publish({
        ...input,
        revision: {
          ...revision,
          reference: {
            ...revision.reference,
            resourceRef: { ...revision.reference.resourceRef, tenantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
          },
        },
      });
      expect(
        Match.value(outcome).pipe(
          Match.tag('invalid', () => true),
          Match.orElse(() => false),
        ),
      ).toBe(true);
    }),
  );

  it.effect('does not write when exact component basis is invalid', () =>
    Effect.gen(function* invalidBasis() {
      const transaction = {
        insert: () => {
          throw new Error('No write allowed');
        },
        select: () => ({
          from: (table: typeof products | typeof productVariants | typeof setCompositions) =>
            selectedRows(table === setCompositions ? [] : [{ lifecycleState: 'ACTIVE', productId, variantId }]),
        }),
      };
      // @ts-expect-error Only the exercised Drizzle query chains are mocked.
      const service = setCompositionPersistenceForScope(transaction, scope, { verify: () => Effect.succeed(false) });
      const outcome = yield* service.publish(input);
      expect(
        Match.value(outcome).pipe(
          Match.tag('invalid', ({ reason }) => reason),
          Match.orElse(() => ''),
        ),
      ).toBe('Component Current basis is invalid');
    }),
  );
});
