import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { SizeEquivalenceAssertionSchema, SizeUsageListSchema } from '../../shared/domain/attribute-vocabulary.ts';
import { SizePersistenceConflict, sizeUsagePersistenceForScope } from '../../src/persistence/size-usage-persistence.ts';

const tenantId = '00000000-0000-4000-8000-000000000001';
const principalId = '00000000-0000-4000-8000-000000000002';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:size-test:run:1',
    authMethod: 'system',
    principalId,
    tenantId,
  }),
  correlationId: 'size-test',
};
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '00000000-0000-4000-8000-000000000003',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const sizeRef = {
  moduleId: 'commerce.catalog',
  resourceId: '00000000-0000-4000-8000-000000000004',
  resourceType: 'commerce.catalog.controlled-attribute-value',
  tenantId,
} as const;
const list = Schema.decodeUnknownSync(SizeUsageListSchema)({ orderedSizeRefs: [sizeRef], productRef });
const assertion = Schema.decodeUnknownSync(SizeEquivalenceAssertionSchema)({
  evidence: 'document:A',
  leftSizeRef: sizeRef,
  rightSizeRef: { ...sizeRef, resourceId: '00000000-0000-4000-8000-000000000005' },
  scope: 'Manufacturing line A',
});
const forbiddenTransaction = new Proxy(
  {},
  {
    get: () => {
      throw new Error('transaction touched');
    },
  },
);

describe('Size usage persistence preflight', () => {
  it.effect('rejects a cross-tenant product before touching storage', () =>
    Effect.gen(function* test() {
      // @ts-expect-error Only the validation path is exercised.
      const service = sizeUsagePersistenceForScope(forbiddenTransaction, scope);
      const result = yield* Effect.flip(
        service.replace({
          actionInvocationId: '00000000-0000-4000-8000-000000000006',
          evidenceRefs: [],
          expectedRevision: 0,
          list: { ...list, productRef: { ...productRef, tenantId: '00000000-0000-4000-8000-000000000099' } },
          principalId,
          reason: 'Verified order',
        }),
      );
      expect(Schema.is(SizePersistenceConflict)(result)).toBe(true);
      if (Schema.is(SizePersistenceConflict)(result)) {
        expect(result.conflict).toBe('INVALID_INPUT');
      }
    }),
  );

  it.effect('rejects an invalid evidence period without touching storage', () =>
    Effect.gen(function* test() {
      // @ts-expect-error Only the validation path is exercised.
      const service = sizeUsagePersistenceForScope(forbiddenTransaction, scope);
      const result = yield* Effect.flip(
        service.assertEquivalence({
          actionInvocationId: '00000000-0000-4000-8000-000000000007',
          assertion: { ...assertion, validFrom: '2026-09-18', validUntil: '2026-09-17' },
          principalId,
        }),
      );
      expect(Schema.is(SizePersistenceConflict)(result)).toBe(true);
      if (Schema.is(SizePersistenceConflict)(result)) {
        expect(result.conflict).toBe('INVALID_INPUT');
      }
    }),
  );
});
