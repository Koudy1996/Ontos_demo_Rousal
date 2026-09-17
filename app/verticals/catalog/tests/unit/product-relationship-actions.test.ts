import type { ActionHandlerContext, DomainEventContractMap } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  ChangeProductRelationshipPayloadSchema,
  CreateProductRelationshipPayloadSchema,
  RemoveProductRelationshipPayloadSchema,
} from '../../shared/actions/product-relationship-mutations.ts';
import {
  changeProductRelationshipAction,
  handleChangeProductRelationship,
} from '../../src/actions/change-product-relationship.action.ts';
import {
  createProductRelationshipAction,
  handleCreateProductRelationship,
} from '../../src/actions/create-product-relationship.action.ts';
import {
  handleRemoveProductRelationship,
  removeProductRelationshipAction,
} from '../../src/actions/remove-product-relationship.action.ts';
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
const context = <Events extends DomainEventContractMap>(
  overrides: Partial<ProductRelationshipPersistence>,
  domainEvents: Events,
) => {
  const events: Array<{ eventType: string; payloadJson: unknown; subjectResourceId: string }> = [];
  const reads: string[] = [];
  const services: ProductRelationshipPersistence = {
    change: unexpected,
    create: unexpected,
    remove: unexpected,
    ...overrides,
  };
  const value: ActionHandlerContext<Events, ProductRelationshipPersistence> = {
    actionInvocationId: '66666666-6666-4666-8666-666666666666',
    addDomainEvent: (event) =>
      Effect.sync(() => {
        expect(Object.keys(domainEvents)).toContain(event.eventType);
        events.push({
          eventType: event.eventType,
          payloadJson: event.payloadJson,
          subjectResourceId: event.subjectResourceId,
        });
        return Object.create(null);
      }),
    addOutboxMessage: () => Effect.void,
    recordAuditEvidence: () => Effect.void,
    recordDataAccess: (access) =>
      Effect.sync(() => {
        reads.push(access.targetResourceId ?? '');
      }),
    scope,
    services,
  };
  return { events, reads, value };
};
const createContext = (overrides: Partial<ProductRelationshipPersistence>) =>
  context(overrides, createProductRelationshipAction.descriptor.domainEvents);
const changeContext = (overrides: Partial<ProductRelationshipPersistence>) =>
  context(overrides, changeProductRelationshipAction.descriptor.domainEvents);
const removeContext = (overrides: Partial<ProductRelationshipPersistence>) =>
  context(overrides, removeProductRelationshipAction.descriptor.domainEvents);

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
      const run = createContext({
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
      expect(run.events).toMatchObject([
        {
          eventType: 'commerce.catalog.product-relationship-changed.v1',
          subjectResourceId: relationshipId,
          payloadJson: { changeKind: 'CREATED', relationshipId, revision: 1, tenantId },
        },
      ]);
      expect(run.events[0]?.payloadJson).not.toHaveProperty('reason');
      expect(run.events[0]?.payloadJson).not.toHaveProperty('evidenceRefs');
    }),
  );

  it.effect('rejects cross-Tenant endpoint before persistence', () =>
    Effect.gen(function* relationshipCrossTenantTest() {
      const run = createContext({});
      const error = yield* handleCreateProductRelationship(
        {
          relationship: { ...relationship, target: { ...target, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
          relationshipId,
        },
        run.value,
      ).pipe(Effect.flip);
      expect(error.code).toBe('product_relationship_not_found');
      expect(run.events).toEqual([]);
    }),
  );

  it.effect('rejects material change without erasing prior truth', () =>
    Effect.gen(function* relationshipMaterialTest() {
      const run = changeContext({});
      const error = yield* handleChangeProductRelationship(
        { classification: 'MATERIAL_CHANGE', expectedRevision: 1, relationship, relationshipId },
        run.value,
      ).pipe(Effect.flip);
      expect(error).toMatchObject({ code: 'product_relationship_conflict', conflict: 'INVALID_CHANGE' });
    }),
  );

  it.effect('maps stale correction and removal to typed conflicts', () =>
    Effect.gen(function* relationshipConflictTest() {
      const changeRun = changeContext({
        change: () => Effect.succeed({ _tag: 'revision_conflict', actualRevision: 2 }),
      });
      const removeRun = removeContext({
        remove: () => Effect.succeed({ _tag: 'revision_conflict', actualRevision: 2 }),
      });
      const changeError = yield* handleChangeProductRelationship(
        { classification: 'EVIDENCED_CORRECTION', expectedRevision: 1, relationship, relationshipId },
        changeRun.value,
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
        removeRun.value,
      ).pipe(Effect.flip);
      expect(removeError).toMatchObject({ code: 'product_relationship_conflict', conflict: 'REVISION' });
      expect(changeRun.events).toEqual([]);
      expect(removeRun.events).toEqual([]);
    }),
  );

  it.effect('announces a committed correction at its resulting revision', () =>
    Effect.gen(function* relationshipCorrectionEventTest() {
      const corrected = {
        ...relationship,
        target: { ...target, resourceId: '44444444-4444-4444-8444-444444444444' },
      } as const;
      const run = changeContext({
        change: () => Effect.succeed({ _tag: 'changed', relationship: corrected, relationshipId, revision: 2 }),
      });
      yield* handleChangeProductRelationship(
        { classification: 'EVIDENCED_CORRECTION', expectedRevision: 1, relationship: corrected, relationshipId },
        run.value,
      );
      expect(run.events).toMatchObject([
        { payloadJson: { changeKind: 'CORRECTED', revision: 2, target: corrected.target } },
      ]);
    }),
  );

  it.effect('closes by effective end without changing endpoint lifecycle', () =>
    Effect.gen(function* relationshipRemoveTest() {
      const ended = { ...relationship, effectivePeriod: { effectiveTo: '2026-09-17T00:00:00.000Z' } } as const;
      const run = removeContext({
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
      expect(run.events).toMatchObject([
        { payloadJson: { changeKind: 'ENDED', relationshipId, revision: 2, tenantId } },
      ]);
    }),
  );

  it.effect('maps exact directed duplicate to typed conflict', () =>
    Effect.gen(function* relationshipDuplicateTest() {
      const run = createContext({ create: () => Effect.succeed({ _tag: 'duplicate' }) });
      const error = yield* handleCreateProductRelationship({ relationship, relationshipId }, run.value).pipe(
        Effect.flip,
      );
      expect(error).toMatchObject({ code: 'product_relationship_conflict', conflict: 'DUPLICATE' });
      expect(run.events).toEqual([]);
    }),
  );
});
