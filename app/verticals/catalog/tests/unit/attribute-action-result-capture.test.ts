import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  getActionDecodedSuccessHook,
  getActionServiceFactory,
} from '../../../../packages/core-runtime/src/actions/definition.ts';
import { createAttributeDefinitionAction } from '../../src/actions/create-attribute-definition.action.ts';
import { createControlledAttributeValueAction } from '../../src/actions/create-controlled-attribute-value.action.ts';
import { reactivateControlledAttributeValueAction } from '../../src/actions/reactivate-controlled-attribute-value.action.ts';
import { removeProductAttributeValuesAction } from '../../src/actions/remove-product-attribute-values.action.ts';
import { removeVariantAttributeOverrideAction } from '../../src/actions/remove-variant-attribute-override.action.ts';
import { renameAttributeDefinitionAction } from '../../src/actions/rename-attribute-definition.action.ts';
import { renameControlledAttributeValueAction } from '../../src/actions/rename-controlled-attribute-value.action.ts';
import { retireControlledAttributeValueAction } from '../../src/actions/retire-controlled-attribute-value.action.ts';
import { setProductAttributeValuesAction } from '../../src/actions/set-product-attribute-values.action.ts';
import { setVariantAttributeOverrideAction } from '../../src/actions/set-variant-attribute-override.action.ts';
import { catalogResultSnapshots } from '../../src/database/schema.ts';

const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:attribute-snapshot-test:run:1',
    authMethod: 'system',
    principalId: '00000000-0000-4000-8000-000000000002',
    tenantId: '00000000-0000-4000-8000-000000000001',
  }),
  correlationId: 'attribute-snapshot-test',
};
const actionInvocationId = '00000000-0000-4000-8000-000000000003';
const ref = (resourceType: string) => ({
  moduleId: 'commerce.catalog',
  resourceId: '00000000-0000-4000-8000-000000000004',
  resourceType,
  tenantId: scope.tenantId,
});
const definitionRef = ref('commerce.catalog.attribute-definition');
const controlledValueRef = ref('commerce.catalog.controlled-attribute-value');
const cases = [
  [
    'create-attribute-definition',
    createAttributeDefinitionAction,
    { attributeDefinitionRef: definitionRef, revision: 1 },
  ],
  [
    'rename-attribute-definition',
    renameAttributeDefinitionAction,
    { attributeDefinitionRef: definitionRef, revision: 1, changed: true },
  ],
  ['create-controlled-attribute-value', createControlledAttributeValueAction, { controlledValueRef, revision: 1 }],
  [
    'rename-controlled-attribute-value',
    renameControlledAttributeValueAction,
    { controlledValueRef, revision: 1, changed: true },
  ],
  [
    'retire-controlled-attribute-value',
    retireControlledAttributeValueAction,
    { controlledValueRef, revision: 1, changed: true, lifecycle: 'RETIRED' },
  ],
  [
    'reactivate-controlled-attribute-value',
    reactivateControlledAttributeValueAction,
    { controlledValueRef, revision: 1, changed: true, lifecycle: 'ACTIVE' },
  ],
  [
    'set-product-attribute-values',
    setProductAttributeValuesAction,
    { attributeValueSetId: actionInvocationId, revision: 1, state: 'SET' },
  ],
  [
    'remove-product-attribute-values',
    removeProductAttributeValuesAction,
    { attributeValueSetId: actionInvocationId, revision: 1, state: 'REMOVED' },
  ],
  [
    'set-variant-attribute-override',
    setVariantAttributeOverrideAction,
    { attributeValueSetId: actionInvocationId, revision: 1, state: 'SET' },
  ],
  [
    'remove-variant-attribute-override',
    removeVariantAttributeOverrideAction,
    { attributeValueSetId: actionInvocationId, revision: 1, state: 'REMOVED' },
  ],
] as const;

describe('Attribute Action result capture', () => {
  it.effect('stores each decoded result with its exact Action identity in the supplied transaction', () =>
    Effect.gen(function* capturesResults() {
      const rows: (typeof catalogResultSnapshots.$inferInsert)[] = [];
      const transaction = {
        insert: (table: typeof catalogResultSnapshots) => {
          expect(table).toBe(catalogResultSnapshots);
          return {
            values: (row: typeof catalogResultSnapshots.$inferInsert) => ({
              onConflictDoNothing: () => ({
                returning: () => {
                  rows.push(row);
                  return Effect.succeed([row]);
                },
              }),
            }),
          };
        },
      };
      for (const [name, action, result] of cases) {
        // @ts-expect-error Focused mock implements only the snapshot insert chain.
        const services = yield* getActionServiceFactory(action)(transaction, scope);
        const hook = getActionDecodedSuccessHook(action);
        expect(hook).toBeDefined();
        if (hook !== undefined) {
          // @ts-expect-error Each tuple's result is paired with its corresponding Action schema.
          yield* hook({ actionInvocationId, result, scope, services });
        }
        expect(rows.at(-1)).toMatchObject({ actionKey: `commerce.catalog.${name}`, schemaVersion: 1 });
      }
      expect(rows).toHaveLength(cases.length);
    }),
  );

  it.effect('aborts decoded success when snapshot storage fails', () =>
    Effect.gen(function* rejectsStorageFailure() {
      const transaction = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: () => Effect.fail(new Error('unavailable')) }),
          }),
        }),
      };
      // @ts-expect-error Focused mock implements only the failing snapshot insert chain.
      const services = yield* getActionServiceFactory(createAttributeDefinitionAction)(transaction, scope);
      const hook = getActionDecodedSuccessHook(createAttributeDefinitionAction);
      expect(hook).toBeDefined();
      if (hook !== undefined) {
        const failure = yield* Effect.flip(
          hook({ actionInvocationId, result: { attributeDefinitionRef: definitionRef, revision: 1 }, scope, services }),
        );
        expect(failure).toMatchObject({ code: 'action_transaction_failed' });
      }
    }),
  );
});
