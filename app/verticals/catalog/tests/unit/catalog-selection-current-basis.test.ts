import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { CatalogSelectionSchema } from '../../shared/domain/catalog-selection-evidence.ts';
import {
  productVariants,
  products,
  setCompositionComponents,
  setCompositionRevisions,
  setCompositions,
} from '../../src/database/schema.ts';
import { catalogSelectionCurrentBasisForScope } from '../../src/persistence/catalog-selection-current-basis.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:selection-current-test:run:1',
    authMethod: 'system',
    principalId: '44444444-4444-4444-8444-444444444444',
    tenantId,
  }),
  correlationId: 'selection-current-test',
};
const selection = {
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: productId,
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: variantId,
    resourceType: 'commerce.catalog.variant',
    tenantId,
  },
} as const;
const selected = (rows: readonly object[]) => ({
  where: () => Object.assign(Effect.succeed(rows), { limit: () => Effect.succeed(rows) }),
});

describe('Catalog Selection Current basis', () => {
  it.effect('never queries a foreign tenant selection', () =>
    Effect.gen(function* foreignTenant() {
      const transaction = {
        select: () => {
          throw new Error('foreign query');
        },
      };
      // @ts-expect-error The deliberately forbidden query path needs no Drizzle methods.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({
        purpose: 'PURCHASE_ACCEPTANCE',
        selection: {
          ...selection,
          productRef: { ...selection.productRef, tenantId: '55555555-5555-4555-8555-555555555555' },
        },
      });
      expect(result.status).toBe('INDETERMINATE');
      expect(result.basis).toEqual([]);
    }),
  );

  it.effect('retains exact owner revisions but does not invent indirect proof', () =>
    Effect.gen(function* partialBasis() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) =>
            selected(
              table === products
                ? [{ lifecycleState: 'ACTIVE', revision: 4 }]
                : [{ lifecycleState: 'ACTIVE', productId, revision: 7 }],
            ),
        }),
      };
      // @ts-expect-error Only the two exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection });
      expect(result.status).toBe('INDETERMINATE');
      expect(result.basis.map(({ role, source }) => [role, source.revision])).toEqual([
        ['PRODUCT', 4],
        ['VARIANT', 7],
      ]);
      expect(result.source).toBe('CATALOG_OWNER_CURRENT_READ');
    }),
  );

  it.effect('rejects a Variant owned by a different Product without membership proof', () =>
    Effect.gen(function* wrongProduct() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) =>
            selected(
              table === products
                ? [{ lifecycleState: 'ACTIVE', revision: 4 }]
                : [{ lifecycleState: 'ACTIVE', productId: '66666666-6666-4666-8666-666666666666', revision: 7 }],
            ),
        }),
      };
      // @ts-expect-error Only the two exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection });
      expect(result.status).toBe('INVALID');
      expect(result.basis.map(({ role }) => role)).toEqual(['PRODUCT']);
    }),
  );

  it.effect('does not promote a missing Configuration or Set revision to Current', () =>
    Effect.gen(function* missingSelectedRevision() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants | typeof setCompositions) => {
            if (table === products) {
              return selected([{ lifecycleState: 'ACTIVE', revision: 4 }]);
            }
            if (table === productVariants) {
              return selected([{ lifecycleState: 'ACTIVE', productId, revision: 7 }]);
            }
            return selected([]);
          },
        }),
      };
      // @ts-expect-error Only the exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const definitionRef = {
        moduleId: 'commerce.catalog',
        resourceId: '77777777-7777-4777-8777-777777777777',
        resourceType: 'commerce.catalog.configuration-definition',
        tenantId,
      };
      const configuration = Schema.decodeUnknownSync(CatalogSelectionSchema)({
        ...selection,
        configuration: {
          choices: [],
          definition: { resourceRef: definitionRef, revision: 1 },
          productRef: selection.productRef,
          variantRef: selection.variantRef,
        },
      });
      const configResult = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection: configuration });
      expect(configResult.status).toBe('INDETERMINATE');
      expect(configResult.basis.map(({ role }) => role)).toEqual(['PRODUCT', 'VARIANT']);
      const setSelection = Schema.decodeUnknownSync(CatalogSelectionSchema)({
        ...selection,
        setComposition: {
          resourceRef: {
            moduleId: 'commerce.catalog',
            resourceId: '88888888-8888-4888-8888-888888888888',
            resourceType: 'commerce.catalog.set-composition',
            tenantId,
          },
          revision: 1,
        },
      });
      const setResult = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection: setSelection });
      expect(setResult.status).toBe('INDETERMINATE');
      expect(setResult.basis.map(({ role }) => role)).toEqual(['PRODUCT', 'VARIANT']);
    }),
  );

  it.effect('rejects a caller-invented Configuration or Set revision ID before emitting owner basis', () =>
    Effect.gen(function* forgedRevisionId() {
      const transaction = {
        select: () => ({
          from: (table: typeof products | typeof productVariants) => {
            if (table === products) {
              return selected([{ lifecycleState: 'ACTIVE', revision: 4 }]);
            }
            if (table === productVariants) {
              return selected([{ lifecycleState: 'ACTIVE', productId, revision: 7 }]);
            }
            throw new Error('forged revision ID must not reach dependent read');
          },
        }),
      };
      // @ts-expect-error Only the exercised Drizzle read chains are mocked.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const forgedId = '99999999-9999-4999-8999-999999999999';
      const refs = [
        {
          configuration: {
            choices: [],
            definition: {
              resourceRef: {
                moduleId: 'commerce.catalog',
                resourceId: '77777777-7777-4777-8777-777777777777',
                resourceType: 'commerce.catalog.configuration-definition',
                tenantId,
              },
              revision: 1,
              revisionId: forgedId,
            },
            productRef: selection.productRef,
            variantRef: selection.variantRef,
          },
        },
        {
          setComposition: {
            resourceRef: {
              moduleId: 'commerce.catalog',
              resourceId: '88888888-8888-4888-8888-888888888888',
              resourceType: 'commerce.catalog.set-composition',
              tenantId,
            },
            revision: 1,
            revisionId: forgedId,
          },
        },
      ];
      for (const extra of refs) {
        const forged = Schema.decodeUnknownSync(CatalogSelectionSchema)({ ...selection, ...extra });
        const result = yield* reader.read({ purpose: 'PURCHASE_ACCEPTANCE', selection: forged });
        expect(result.status).toBe('INDETERMINATE');
        expect(result.basis.map(({ role }) => role)).toEqual(['PRODUCT', 'VARIANT']);
        expect(result.basis.some(({ source }) => source.revisionId === forgedId)).toBe(false);
      }
    }),
  );

  it.effect('rejects a stale Set revision only after the owner resolves its Current revision', () =>
    Effect.gen(function* staleSet() {
      const compositionId = '88888888-8888-4888-8888-888888888888';
      const component = (componentId: string) => ({
        componentId,
        componentProductId: productId,
        componentVariantId: variantId,
        configuration: null,
        packageContentRevision: null,
        packageDefinitionId: null,
        quantityAmount: '1',
        quantityUnitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
      const transaction = {
        select: () => ({
          from: (
            table:
              | typeof products
              | typeof productVariants
              | typeof setCompositionComponents
              | typeof setCompositionRevisions
              | typeof setCompositions,
          ) => {
            if (table === products) {
              return selected([{ lifecycleState: 'ACTIVE', revision: 4 }]);
            }
            if (table === productVariants) {
              return selected([{ lifecycleState: 'ACTIVE', productId, revision: 7 }]);
            }
            if (table === setCompositionComponents) {
              return selected([
                component('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
                component('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
              ]);
            }
            if (table === setCompositionRevisions) {
              return selected([
                {
                  changeKind: 'INITIAL',
                  effectiveFrom: new Date('1960-01-01'),
                  effectiveTo: null,
                  evidenceRefs: ['owner'],
                  lifecycleState: 'ACTIVE',
                  predecessorRevision: null,
                  productId,
                  reason: 'initial',
                  revision: 1,
                  variantId,
                },
              ]);
            }
            if (table === setCompositions) {
              return selected([{ currentRevision: 1, productId, variantId }]);
            }
            return selected([{ currentRevision: 1, productId, variantId }]);
          },
        }),
      };
      // @ts-expect-error The mock implements only the exercised owner read chains.
      const reader = catalogSelectionCurrentBasisForScope(transaction, scope);
      const result = yield* reader.read({
        purpose: 'PURCHASE_ACCEPTANCE',
        selection: Schema.decodeUnknownSync(CatalogSelectionSchema)({
          ...selection,
          setComposition: {
            resourceRef: {
              moduleId: 'commerce.catalog',
              resourceId: compositionId,
              resourceType: 'commerce.catalog.set-composition',
              tenantId,
            },
            revision: 2,
          },
        }),
      });
      expect(result).toMatchObject({
        reason: 'Selected Set Composition is not Current for this exact target',
        status: 'INVALID',
      });
      expect(result.basis.map(({ role }) => role)).toEqual(['PRODUCT', 'VARIANT']);
    }),
  );
});
