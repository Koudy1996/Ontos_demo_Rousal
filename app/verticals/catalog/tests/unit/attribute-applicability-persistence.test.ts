import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { describe, expect, it } from 'effect-rstest';
import { Effect, Schema } from 'effect';

import {
  AttributeApplicabilityConflict,
  attributeApplicabilityPersistenceForScope,
  mapAttributeApplicabilityWriteError,
} from '../../src/persistence/attribute-applicability-persistence.ts';
import { CatalogPersistenceUnavailable } from '../../src/persistence/errors.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const principalId = '22222222-2222-4222-8222-222222222222';
const productRef = {
  moduleId: 'commerce.catalog' as const,
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.product' as const,
  tenantId,
};
const attributeDefinitionRef = {
  moduleId: 'commerce.catalog' as const,
  resourceId: '44444444-4444-4444-8444-444444444444',
  resourceType: 'commerce.catalog.attribute-definition' as const,
  tenantId,
};

describe('Product-local Attribute applicability', () => {
  it('maps only its own invocation uniqueness failure', () => {
    expect(
      mapAttributeApplicabilityWriteError({
        code: '23505',
        constraint: 'catalog_product_attribute_applicability_revisions_invocation_uk',
      }),
    ).toMatchObject({ conflict: 'ACTION_INVOCATION_ID' });
    for (const cause of [
      { code: '23505', constraint: 'catalog_product_attribute_applicability_pk' },
      new Error('storage unavailable'),
    ]) {
      const mapped = mapAttributeApplicabilityWriteError(cause);
      expect(Schema.is(AttributeApplicabilityConflict)(mapped)).toBe(false);
      expect(Schema.is(CatalogPersistenceUnavailable)(mapped)).toBe(true);
      expect(mapped.cause).toBe(cause);
    }
  });

  it.effect('rejects malformed, cross-Tenant, and empty initial declarations before any query', () =>
    Effect.gen(function* rejectBeforeIO() {
      const scope = {
        ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
          authContextRef: 'job:attribute-applicability:run:1',
          authMethod: 'system',
          principalId,
          tenantId,
        }),
        correlationId: 'attribute-applicability-test',
      };
      // @ts-expect-error No query is legal for these rejected inputs.
      const persistence = yield* attributeApplicabilityPersistenceForScope({}, scope);
      const base = {
        actionInvocationId: '55555555-5555-4555-8555-555555555555',
        attributeDefinitionRef,
        expectedRevision: null,
        principalId,
        productLevel: true,
        productRef,
        reason: 'Deliberate Product-local use',
        variantLevel: false,
      };
      for (const input of [
        { ...base, productLevel: false },
        { ...base, reason: ' padded ' },
        { ...base, productRef: { ...productRef, tenantId: '66666666-6666-4666-8666-666666666666' } },
      ]) {
        const result = yield* Effect.flip(persistence.change(input));
        expect(result).toMatchObject({ conflict: 'INVALID_INPUT' });
      }
    }),
  );
});
