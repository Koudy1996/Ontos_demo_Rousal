import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { catalogOpenSelectionImpactForScope } from '../../src/persistence/catalog-open-selection-impact.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:open-selection-test:run:1',
    authMethod: 'system',
    principalId: '22222222-2222-4222-8222-222222222222',
    tenantId,
  }),
  correlationId: 'open-selection-test',
};

describe('Catalog open-selection impact', () => {
  it.effect('fails closed without a durable complete population source', () =>
    Effect.gen(function* rejectUnprovenPopulation() {
      const transaction = {
        select: () => {
          throw new Error('must not infer population from private rows');
        },
      };
      const productRef = {
        moduleId: 'commerce.catalog',
        resourceId: '33333333-3333-4333-8333-333333333333',
        resourceType: 'commerce.catalog.product',
        tenantId,
      } as const;
      // @ts-expect-error The deliberately unused transaction has no Drizzle methods.
      const result = yield* Effect.flip(catalogOpenSelectionImpactForScope(transaction, scope).assess(productRef));
      expect(result.code).toBe('catalog_open_selection_impact_unavailable');
    }),
  );
});
