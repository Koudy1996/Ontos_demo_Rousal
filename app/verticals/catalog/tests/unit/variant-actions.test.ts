import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { handleChangeVariant } from '../../src/actions/change-variant.action.ts';
import { handleCreateVariant } from '../../src/actions/create-variant.action.ts';
import { handleRetireVariant } from '../../src/actions/retire-variant.action.ts';
import type { VariantPersistence } from '../../src/persistence/variant-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const variant = { lifecycle: 'WORK_IN_PROGRESS', productRef, variantId: variantRef.resourceId, variantRef } as const;
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:variant-actions:run:1',
    authMethod: 'system',
    principalId: '55555555-5555-4555-8555-555555555555',
    tenantId,
  }),
  correlationId: 'variant-action-test',
};
const unexpected = () => Effect.die('Unexpected persistence call');
const context = (overrides: Partial<VariantPersistence>) => {
  const reads: string[] = [];
  const services: VariantPersistence = {
    change: unexpected,
    create: unexpected,
    reactivate: unexpected,
    retire: unexpected,
    ...overrides,
  };
  const value: ActionHandlerContext<Readonly<Record<string, never>>, VariantPersistence> = {
    actionInvocationId: '66666666-6666-4666-8666-666666666666',
    addDomainEvent: () => Effect.succeed(Object.create(null)),
    addOutboxMessage: () => Effect.void,
    recordAuditEvidence: () => Effect.void,
    recordDataAccess: (access) =>
      Effect.sync(() => {
        reads.push(access.targetResourceId ?? '');
      }),
    scope,
    services,
  };
  return { reads, value };
};

describe('Variant Action handlers', () => {
  it.effect('creates only under trusted Tenant and records governed access', () =>
    Effect.gen(function* variantCreateTest() {
      const run = context({
        create: (input) =>
          Effect.sync(() => {
            expect(input.principalId).toBe(scope.principalId);
            expect(input.expectedProductRevision).toBe(1);
            return { _tag: 'created', revision: 1, variant } as const;
          }),
      });
      const result = yield* handleCreateVariant(
        { evidenceRefs: ['sheet'], expectedProductRevision: 1, productRef, reason: 'Real form', variantRef },
        run.value,
      );
      expect(result.variant.lifecycle).toBe('WORK_IN_PROGRESS');
      expect(run.reads).toEqual([variantRef.resourceId]);
    }),
  );

  it.effect('rejects cross-tenant creation before persistence', () =>
    Effect.gen(function* variantCrossTenantTest() {
      const run = context({});
      const error = yield* handleCreateVariant(
        {
          evidenceRefs: ['sheet'],
          expectedProductRevision: 1,
          productRef,
          reason: 'Wrong tenant',
          variantRef: { ...variantRef, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        },
        run.value,
      ).pipe(Effect.flip);
      expect(error.code).toBe('variant_action_not_found');
    }),
  );

  it.effect('maps concurrent identity collision to typed conflict', () =>
    Effect.gen(function* variantCollisionTest() {
      const run = context({ create: () => Effect.succeed({ _tag: 'identity_conflict' }) });
      const error = yield* handleCreateVariant(
        { evidenceRefs: ['sheet'], expectedProductRevision: 1, productRef, reason: 'Duplicate', variantRef },
        run.value,
      ).pipe(Effect.flip);
      expect(error).toMatchObject({ code: 'variant_action_conflict', conflict: 'IDENTITY' });
    }),
  );

  it.effect('retirement affects only its exact Variant and maps stale revision', () =>
    Effect.gen(function* variantRetireTest() {
      const run = context({
        retire: (input) =>
          Effect.sync(() => {
            expect(input.variantRef).toEqual(variantRef);
            return { _tag: 'revision_conflict', actualRevision: 3 } as const;
          }),
      });
      const error = yield* handleRetireVariant(
        { expectedVariantRevision: 2, reason: 'Retire', variantRef },
        run.value,
      ).pipe(Effect.flip);
      expect(error).toMatchObject({ code: 'variant_action_conflict', conflict: 'REVISION' });
    }),
  );

  it.effect('passes semantic classification through to owner-local persistence', () =>
    Effect.gen(function* variantClassificationTest() {
      const run = context({
        change: (input) =>
          Effect.sync(() => {
            expect(input.classification).toBe('EVIDENCED_CORRECTION');
            return { _tag: 'invalid_change' } as const;
          }),
      });
      const error = yield* handleChangeVariant(
        {
          classification: 'EVIDENCED_RECORD_CORRECTION',
          evidenceRefs: ['drawing'],
          expectedVariantRevision: 1,
          reason: 'Wrong record',
          variantRef,
        },
        run.value,
      ).pipe(Effect.flip);
      expect(error).toMatchObject({ code: 'variant_action_conflict', conflict: 'INVALID_CHANGE' });
    }),
  );
});
