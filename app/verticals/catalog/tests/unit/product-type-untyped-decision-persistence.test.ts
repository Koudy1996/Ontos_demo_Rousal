import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import type { products } from '../../src/database/schema.ts';
import { productTypeUntypedDecisionPersistenceForScope } from '../../src/persistence/product-type-untyped-decision-persistence.ts';
import { DecideProductTypeUnnecessaryPayloadSchema } from '../../shared/actions/decide-product-type-unnecessary.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:untyped-decision-test:run:1',
    authMethod: 'system',
    principalId: '33333333-3333-4333-8333-333333333333',
    tenantId,
  }),
  correlationId: 'untyped-decision-test',
};
const decisionPayload = Schema.decodeUnknownSync(DecideProductTypeUnnecessaryPayloadSchema)({
  decisionState: 'CONFIRMED',
  evidenceRefs: ['catalog-review:123'],
  expectedAxisRevision: 0,
  expectedDecisionRevision: 0,
  expectedProductRevision: 1,
  expectedValueRevisionTokens: [],
  expectedVariantRevisionTokens: [],
  productRef: {
    moduleId: 'commerce.catalog',
    resourceId: productId,
    resourceType: 'commerce.catalog.product',
    tenantId,
  },
  reason: 'No structured facts or axes needed',
  structuredAttributesRequired: false,
  variantAxesRequired: false,
});

const productRows = (revision?: number) =>
  Effect.succeed(revision === undefined ? [] : [{ currentRevision: revision, productId, tenantId }]);
const transaction = (revision?: number) => {
  const selected = { limit: () => productRows(revision) };
  const locked = { for: () => selected };
  const filtered = { where: () => locked };
  const from = (_table: typeof products) => filtered;
  return { select: () => ({ from }) };
};

describe('Product Type untyped decision persistence', () => {
  for (const [revision, reason] of [
    [undefined, 'Product is not Current'],
    [2, 'Product revision is stale'],
  ] as const) {
    it.effect(`rejects ${reason} before appending a decision`, () =>
      Effect.gen(function* test() {
        // @ts-expect-error The mock supplies the first locked query only.
        const service = yield* productTypeUntypedDecisionPersistenceForScope(transaction(revision), scope);
        const reasonResult = yield* service
          .decide({
            actionInvocationId: '44444444-4444-4444-8444-444444444444',
            payload: decisionPayload,
            principalId: scope.principalId,
          })
          .pipe(Effect.match({ onFailure: (failure) => failure.reason, onSuccess: () => 'unexpected success' }));
        expect(reasonResult).toContain(reason);
      }),
    );
  }
});
