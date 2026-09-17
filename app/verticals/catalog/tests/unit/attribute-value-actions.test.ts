import type { ActionHandlerContext } from '@app/core-runtime';
import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { describe, expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';

import {
  RemoveProductAttributeValuesPayloadSchema,
  RemoveVariantAttributeOverridePayloadSchema,
  SetProductAttributeValuesPayloadSchema,
  SetVariantAttributeOverridePayloadSchema,
} from '../../shared/actions/attribute-value-mutations.ts';
import {
  handleRemoveProductAttributeValues,
  removeProductAttributeValuesAction,
} from '../../src/actions/remove-product-attribute-values.action.ts';
import {
  handleRemoveVariantAttributeOverride,
  removeVariantAttributeOverrideAction,
} from '../../src/actions/remove-variant-attribute-override.action.ts';
import {
  handleSetProductAttributeValues,
  setProductAttributeValuesAction,
} from '../../src/actions/set-product-attribute-values.action.ts';
import {
  handleSetVariantAttributeOverride,
  setVariantAttributeOverrideAction,
} from '../../src/actions/set-variant-attribute-override.action.ts';
import { AttributeValuesConflict } from '../../src/persistence/attribute-values-persistence.ts';
import type { AttributeValuesPersistence } from '../../src/persistence/attribute-values-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
};
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
};
const attributeDefinitionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
};
const base = { attributeDefinitionRef, expectedRevision: null, productRef, reason: 'Assign documented product fact' };
const unexpected = () => Effect.die('Unexpected persistence method');
const failure = (conflict: AttributeValuesConflict['conflict']) =>
  new AttributeValuesConflict({ code: 'attribute_values_conflict', conflict, reason: 'Unsafe value change' });
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:attribute-values:run:1',
    authMethod: 'system',
    principalId: '55555555-5555-4555-8555-555555555555',
    tenantId,
  }),
  correlationId: 'attribute-values-handoff-test',
};
const makeContext = (
  services: AttributeValuesPersistence,
): ActionHandlerContext<Readonly<Record<string, never>>, AttributeValuesPersistence> => ({
  actionInvocationId: '66666666-6666-4666-8666-666666666666',
  addDomainEvent: () => Effect.succeed(Object.create(null)),
  addOutboxMessage: () => Effect.void,
  recordAuditEvidence: () => Effect.void,
  recordDataAccess: () => Effect.void,
  scope,
  services,
});

describe('Catalog attribute value Actions', () => {
  it('requires a real value and optimistic revision while distinguishing absent from unknown', () => {
    expect(Schema.is(SetProductAttributeValuesPayloadSchema)({ ...base, values: [] })).toBe(false);
    expect(Schema.is(SetProductAttributeValuesPayloadSchema)({ ...base, values: [{ kind: 'TEXT', text: '' }] })).toBe(
      false,
    );
    expect(
      Schema.is(SetProductAttributeValuesPayloadSchema)({ ...base, values: [{ kind: 'SPECIAL', state: 'UNKNOWN' }] }),
    ).toBe(true);
    expect(
      Schema.is(SetProductAttributeValuesPayloadSchema)({
        ...base,
        expectedRevision: -1,
        values: [{ kind: 'SPECIAL', state: 'UNKNOWN' }],
      }),
    ).toBe(false);
    expect(
      Schema.is(SetVariantAttributeOverridePayloadSchema)({
        ...base,
        values: [{ kind: 'TEXT', text: 'Blue' }],
        variantRef,
      }),
    ).toBe(true);
    expect(Schema.is(RemoveVariantAttributeOverridePayloadSchema)({ ...base, variantRef })).toBe(false);
    expect(
      Schema.is(RemoveVariantAttributeOverridePayloadSchema)({
        ...base,
        expectedProductValueRevision: null,
        variantRef,
      }),
    ).toBe(true);
  });

  it.effect('passes trusted execution identity and a typed value to scoped persistence', () =>
    Effect.gen(function* handoff() {
      const payload = Schema.decodeUnknownSync(SetProductAttributeValuesPayloadSchema)({
        ...base,
        values: [{ kind: 'SPECIAL', state: 'UNKNOWN' }],
      });
      const services: AttributeValuesPersistence = {
        removeProductValues: unexpected,
        removeVariantOverride: unexpected,
        setProductValues: (input) =>
          Effect.sync(() => {
            expect(input.actionInvocationId).toBe('66666666-6666-4666-8666-666666666666');
            expect(input.principalId).toBe(scope.principalId);
            expect(input.values).toEqual([{ kind: 'SPECIAL', state: 'UNKNOWN' }]);
            return { attributeValueSetId: '77777777-7777-4777-8777-777777777777', revision: 1, state: 'SET' as const };
          }),
        setVariantOverride: unexpected,
      };
      const result = yield* handleSetProductAttributeValues(payload, makeContext(services));
      expect(result.state).toBe('SET');
    }),
  );

  it.effect('removes a Variant override only with the caller-observed inherited source revision', () =>
    Effect.gen(function* removeOverrideHandoff() {
      const payload = Schema.decodeUnknownSync(RemoveVariantAttributeOverridePayloadSchema)({
        ...base,
        expectedProductValueRevision: 3,
        expectedRevision: 2,
        variantRef,
      });
      const services: AttributeValuesPersistence = {
        removeProductValues: unexpected,
        removeVariantOverride: (input) =>
          Effect.sync(() => {
            expect(input.expectedProductValueRevision).toBe(3);
            expect(input.expectedRevision).toBe(2);
            expect(input.variantRef.resourceId).toBe(variantRef.resourceId);
            expect(input.actionInvocationId).toBe('66666666-6666-4666-8666-666666666666');
            return {
              attributeValueSetId: '77777777-7777-4777-8777-777777777777',
              revision: 3,
              state: 'REMOVED' as const,
            };
          }),
        setProductValues: unexpected,
        setVariantOverride: unexpected,
      };
      const result = yield* handleRemoveVariantAttributeOverride(payload, makeContext(services));
      expect(result.state).toBe('REMOVED');
    }),
  );

  it.effect('preserves typed fail-closed conflicts from all four persistence operations', () =>
    Effect.gen(function* rejectedChanges() {
      const services: AttributeValuesPersistence = {
        removeProductValues: () => Effect.fail(failure('REQUIRED')),
        removeVariantOverride: () => Effect.fail(failure('BASIS_CHANGED')),
        setProductValues: () => Effect.fail(failure('CONTROLLED_RETIRED')),
        setVariantOverride: () => Effect.fail(failure('IDENTITY_IMPACT')),
      };
      const context = makeContext(services);
      const productSet = Schema.decodeUnknownSync(SetProductAttributeValuesPayloadSchema)({
        ...base,
        values: [{ kind: 'TEXT', text: 'Steel' }],
      });
      const productRemove = Schema.decodeUnknownSync(RemoveProductAttributeValuesPayloadSchema)(base);
      const variantSet = Schema.decodeUnknownSync(SetVariantAttributeOverridePayloadSchema)({
        ...base,
        values: [{ kind: 'TEXT', text: 'Blue' }],
        variantRef,
      });
      const variantRemove = Schema.decodeUnknownSync(RemoveVariantAttributeOverridePayloadSchema)({
        ...base,
        expectedProductValueRevision: null,
        variantRef,
      });
      const outcomes = yield* Effect.all([
        handleSetProductAttributeValues(productSet, context).pipe(Effect.flip),
        handleRemoveProductAttributeValues(productRemove, context).pipe(Effect.flip),
        handleSetVariantAttributeOverride(variantSet, context).pipe(Effect.flip),
        handleRemoveVariantAttributeOverride(variantRemove, context).pipe(Effect.flip),
      ]);
      expect(
        outcomes.map((outcome) => (Schema.is(AttributeValuesConflict)(outcome) ? outcome.conflict : 'OTHER')),
      ).toEqual(['CONTROLLED_RETIRED', 'REQUIRED', 'IDENTITY_IMPACT', 'BASIS_CHANGED']);
    }),
  );

  it('requires explicit tenant permission, idempotency and typed conflict on each mutation', () => {
    const conflict = new AttributeValuesConflict({
      code: 'attribute_values_conflict',
      conflict: 'REVISION',
      reason: 'Revision changed',
    });
    for (const action of [
      setProductAttributeValuesAction,
      removeProductAttributeValuesAction,
      setVariantAttributeOverrideAction,
      removeVariantAttributeOverrideAction,
    ]) {
      expect(action.descriptor.entrypoint.scope).toBe('tenant');
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
      expect(action.descriptor.idempotency).toBe('required');
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(Schema.is(action.descriptor.domainErrorSchema)(conflict)).toBe(true);
    }
  });
});
