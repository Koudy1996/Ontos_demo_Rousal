import { describe, expect, it } from 'effect-rstest';
import { Effect } from 'effect';

import { effectiveAttributeValueReadsForScope } from '../../src/persistence/effective-attribute-value-reads.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const foreignTenantId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const definitionId = '55555555-5555-4555-8555-555555555555';

describe('private effective attribute value reads', () => {
  it.effect('rejects foreign references before touching owner persistence', () =>
    Effect.gen(function* () {
      const reads = yield* effectiveAttributeValueReadsForScope(
        // This must never be used: malformed references are rejected first.
        null as never,
        { tenantId } as never,
      );
      const result = yield* reads.resolveVariant({
        attributeDefinitionRef: {
          moduleId: 'commerce.catalog',
          resourceId: definitionId,
          resourceType: 'commerce.catalog.attribute-definition',
          tenantId,
        },
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
          tenantId: foreignTenantId,
        },
      });
      expect(result.status).toBe('INVALID_AUTHORITY');
    }),
  );
});
