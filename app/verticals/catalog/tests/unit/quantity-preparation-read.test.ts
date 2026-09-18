import { ReadHandlerNotFound } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  QuantityPreparationRequestSchema,
  QuantityPreparationResponseSchema,
} from '../../shared/apis/quantity-preparation.ts';
import type { QuantityPreparationRequest } from '../../shared/apis/quantity-preparation.ts';
import { readQuantityPreparation, quantityPreparationRead } from '../../src/api/quantity-preparation.read.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const selection = {
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: '22222222-2222-4222-8222-222222222222',
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  variantRef: {
    moduleId: 'commerce.catalog',
    resourceId: '33333333-3333-4333-8333-333333333333',
    resourceType: 'commerce.catalog.variant',
    tenantId,
  },
} as const;
const request = Schema.decodeUnknownSync(QuantityPreparationRequestSchema)({ amount: '2.537', selection });

describe('Catalog governed Quantity preparation', () => {
  it.effect('returns the exact PREPARE candidate snapshot without claiming approval or price', () =>
    Effect.gen(function* preparesCandidate() {
      const observed: unknown[] = [];
      const services = {
        prepare: (input: QuantityPreparationRequest & { readonly phase: 'PREPARE' }) => {
          observed.push(input);
          return Effect.succeed({
            divisible: true,
            quantity: {
              changed: true,
              notice: 'ROUNDED',
              requested: '2.537',
              resulting: '2.54',
              rounding: 'UP',
              status: 'VALID',
              step: '0.01',
              targetId: selection.variantRef.resourceId,
              tenantId,
              unitId: '44444444-4444-4444-8444-444444444444',
              unitRuleRevision: 7,
            },
            selection,
            sources: {
              packageDefinition: null,
              product: { resourceRef: selection.productRef, revision: 2 },
              targetDivisibilityRevision: 5,
              unitRuleRevision: 7,
              variant: { resourceRef: selection.variantRef, revision: 3 },
            },
            status: 'PREPARED',
            unitRef: {
              moduleId: 'commerce.catalog',
              resourceId: '44444444-4444-4444-8444-444444444444',
              resourceType: 'commerce.catalog.product-unit',
              tenantId,
            },
          } as const);
        },
      };
      // @ts-expect-error The fake supplies the one owner-local service exercised by this read.
      const result = yield* readQuantityPreparation(request, tenantId, services);
      expect(observed).toEqual([{ amount: '2.537', phase: 'PREPARE', selection: request.selection }]);
      expect(result.status).toBe('PREPARED');
      expect(() => Schema.encodeSync(QuantityPreparationResponseSchema)(result)).not.toThrow();
      expect(JSON.stringify(result)).not.toContain('APPROVED');
    }),
  );

  it.effect('rejects a foreign Product before owner-local persistence', () =>
    Effect.gen(function* rejectsForeignProduct() {
      const services = { prepare: () => Effect.die('must not read') };
      const failure = yield* readQuantityPreparation(request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', services).pipe(
        Effect.flip,
      );
      expect(Schema.is(ReadHandlerNotFound)(failure)).toBe(true);
      expect(quantityPreparationRead.descriptor.permissionTarget).toBe('resource');
    }),
  );
});
