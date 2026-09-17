import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  ChangeProductManufacturerPayloadSchema,
  RemoveProductManufacturerPayloadSchema,
  SetProductManufacturerPayloadSchema,
} from '../../shared/actions/manufacturer-mutations.ts';
import {
  ManufacturerPersistenceUnavailable,
  manufacturerPersistenceForScope,
} from '../../src/persistence/manufacturer-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const relationId = '33333333-3333-4333-8333-333333333333';
const subject = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const target = {
  kind: 'PARTY',
  partyRef: {
    moduleId: 'party.registry',
    resourceId: 'external-maker',
    resourceType: 'party.registry.party',
    tenantId,
  },
} as const;
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:manufacturer-persistence-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'manufacturer-persistence-test',
};
const evidence = { actionInvocationId: '55555555-5555-4555-8555-555555555555', principalId };
const payload = {
  effectivePeriod: {},
  evidenceRefs: ['manufacturer-declaration'] as const,
  reason: 'Source declaration verified',
  relationId,
  subject,
  target,
};
const setPayload = Schema.decodeUnknownSync(SetProductManufacturerPayloadSchema)(payload);
const changePayload = Schema.decodeUnknownSync(ChangeProductManufacturerPayloadSchema)({
  ...payload,
  expectedRevision: 1,
});
const removePayload = Schema.decodeUnknownSync(RemoveProductManufacturerPayloadSchema)({
  ...payload,
  expectedRevision: 1,
});

describe('Manufacturer persistence without owner verification and relational storage', () => {
  it.effect('fails mutations and history before any database access', () =>
    Effect.gen(function* testUnavailableManufacturerPersistence() {
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
      // @ts-expect-error Incomplete transaction proves no Drizzle method is touched.
      const service = manufacturerPersistenceForScope(transaction, scope);
      const setFailure = yield* Effect.flip(service.set({ ...evidence, payload: setPayload }));
      const changeFailure = yield* Effect.flip(service.change({ ...evidence, payload: changePayload }));
      const removeFailure = yield* Effect.flip(service.remove({ ...evidence, payload: removePayload }));
      const historyFailure = yield* Effect.flip(service.history(relationId, subject));
      for (const failure of [setFailure, changeFailure, removeFailure, historyFailure]) {
        expect(Schema.is(ManufacturerPersistenceUnavailable)(failure)).toBe(true);
      }
    }),
  );
});
