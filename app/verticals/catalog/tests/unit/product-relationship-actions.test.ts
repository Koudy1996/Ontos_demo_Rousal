import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  ChangeProductRelationshipPayloadSchema,
  CreateProductRelationshipPayloadSchema,
  RemoveProductRelationshipPayloadSchema,
} from '../../shared/actions/product-relationship-mutations.ts';
import { handleChangeProductRelationship } from '../../src/actions/change-product-relationship.action.ts';
import { handleCreateProductRelationship } from '../../src/actions/create-product-relationship.action.ts';
import { handleRemoveProductRelationship } from '../../src/actions/remove-product-relationship.action.ts';
import type { ProductRelationshipPersistence } from '../../src/persistence/product-relationship-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const relationshipId = '77777777-7777-4777-8777-777777777777';
const source = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const target = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const relationship = {
  effectivePeriod: {},
  evidenceRefs: ['manufacturer-sheet'],
  reason: 'Confirmed fit',
  source,
  target,
  type: 'ACCESSORY_FOR',
} as const;
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:relationship-actions:run:1',
    authMethod: 'system',
    principalId: '55555555-5555-4555-8555-555555555555',
    tenantId,
  }),
  correlationId: 'relationship-action-test',
};
const unexpected = () => Effect.die('Unexpected persistence call');
const context = (overrides: Partial<ProductRelationshipPersistence>) => {
  const reads: string[] = [];
  const services: ProductRelationshipPersistence = {
    change: unexpected,
    create: unexpected,
    remove: unexpected,
    ...overrides,
  };
  const value: ActionHandlerContext<Readonly<Record<string, never>>, ProductRelationshipPersistence> = {
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

describe('Product relationship Action contracts and handlers', () => {
  it('requires explicit type, endpoints, evidence, and optimistic revision', () => {
    expect(
      Schema.decodeUnknownSync(CreateProductRelationshipPayloadSchema)({ relationship, relationshipId }).relationship
        .type,
    ).toBe('ACCESSORY_FOR');
    expect(() =>
      Schema.decodeUnknownSync(CreateProductRelationshipPayloadSchema)({
        relationship: { ...relationship, type: 'OTHER' },
        relationshipId,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ChangeProductRelationshipPayloadSchema)({
        classification: 'EVIDENCED_CORRECTION',
        expectedRevision: 0,
        relationship,
        relationshipId,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(RemoveProductRelationshipPayloadSchema)({
        expectedRevision: 1,
        reason: 'Close',
        relationshipId,
      }),
    ).toThrow();
  });

  it.effect('creates a directed relationship and records both governed endpoint reads', () =>
    Effect.gen(function* relationshipCreateTest() {
      const run = context({
        create: (input) =>
          Effect.sync(() => {
            expect(input.principalId).toBe(scope.principalId);
            expect(input.relationship.source).toEqual(source);
            expect(input.relationship.target).toEqual(target);
            return { _tag: 'created', relationship, relationshipId, revision: 1 } as const;
          }),
      });
      const result = yield* handleCreateProductRelationship({ relationship, relationshipId }, run.value);
      expect(result.revision).toBe(1);
      expect(run.reads).toEqual([source.resourceId, target.resourceId]);
    }),
  );

  it.effect('rejects cross-Tenant endpoint before persistence', () =>
    Effect.gen(function* relationshipCrossTenantTest() {
      const run = context({});
      const error = yield* handleCreateProductRelationship(
        {
          relationship: { ...relationship, target: { ...target, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
          relationshipId,
        },
        run.value,
      ).pipe(Effect.flip);
      expect(error.code).toBe('product_relationship_not_found');
    }),
  );

  it.effect('rejects material change without erasing prior truth', () =>
    Effect.gen(function* relationshipMaterialTest() {
      const run = context({});
      const error = yield* handleChangeProductRelationship(
        { classification: 'MATERIAL_CHANGE', expectedRevision: 1, relationship, relationshipId },
        run.value,
      ).pipe(Effect.flip);
      expect(error).toMatchObject({ code: 'product_relationship_conflict', conflict: 'INVALID_CHANGE' });
    }),
  );

  it.effect('maps stale correction and removal to typed conflicts', () =>
    Effect.gen(function* relationshipConflictTest() {
      const run = context({
        change: () => Effect.succeed({ _tag: 'revision_conflict', actualRevision: 2 }),
        remove: () => Effect.succeed({ _tag: 'revision_conflict', actualRevision: 2 }),
      });
      const changeError = yield* handleChangeProductRelationship(
        { classification: 'EVIDENCED_CORRECTION', expectedRevision: 1, relationship, relationshipId },
        run.value,
      ).pipe(Effect.flip);
      expect(changeError).toMatchObject({ code: 'product_relationship_conflict', conflict: 'REVISION' });
      const removeError = yield* handleRemoveProductRelationship(
        {
          effectiveTo: '2026-09-17T00:00:00.000Z',
          evidenceRefs: ['sheet'],
          expectedRevision: 1,
          reason: 'No longer current',
          relationshipId,
        },
        run.value,
      ).pipe(Effect.flip);
      expect(removeError).toMatchObject({ code: 'product_relationship_conflict', conflict: 'REVISION' });
    }),
  );

  it.effect('closes by effective end without changing endpoint lifecycle', () =>
    Effect.gen(function* relationshipRemoveTest() {
      const ended = { ...relationship, effectivePeriod: { effectiveTo: '2026-09-17T00:00:00.000Z' } } as const;
      const run = context({
        remove: (input) =>
          Effect.sync(() => {
            expect(input.effectiveTo).toBe('2026-09-17T00:00:00.000Z');
            expect(input.evidenceRefs).toEqual(['sheet']);
            return { _tag: 'removed', relationship: ended, relationshipId, revision: 2 } as const;
          }),
      });
      const result = yield* handleRemoveProductRelationship(
        {
          effectiveTo: '2026-09-17T00:00:00.000Z',
          evidenceRefs: ['sheet'],
          expectedRevision: 1,
          reason: 'No longer current',
          relationshipId,
        },
        run.value,
      );
      expect(result.relationship.effectivePeriod.effectiveTo).toBe('2026-09-17T00:00:00.000Z');
      expect(run.reads).toEqual([source.resourceId, target.resourceId]);
    }),
  );

  it.effect('maps exact directed duplicate to typed conflict', () =>
    Effect.gen(function* relationshipDuplicateTest() {
      const run = context({ create: () => Effect.succeed({ _tag: 'duplicate' }) });
      const error = yield* handleCreateProductRelationship({ relationship, relationshipId }, run.value).pipe(
        Effect.flip,
      );
      expect(error).toMatchObject({ code: 'product_relationship_conflict', conflict: 'DUPLICATE' });
    }),
  );
});
