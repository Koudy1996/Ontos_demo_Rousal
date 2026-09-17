import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { DateTime, Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { productTypeAssignments, productTypeRevisions, productTypes, products } from '../../src/database/schema.ts';
import type { productTypeRevisionAttributes } from '../../src/database/schema.ts';
import { productTypeReadinessSourceForScope } from '../../src/persistence/product-type-readiness-source.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const typeId = '33333333-3333-4333-8333-333333333333';
const definitionId = '44444444-4444-4444-8444-444444444444';
const revisionId = '55555555-5555-4555-8555-555555555555';
const at = DateTime.makeUnsafe('2026-09-17T12:00:00.000Z');
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:product-type-source-test:run:1',
    authMethod: 'system',
    principalId: '66666666-6666-4666-8666-666666666666',
    tenantId,
  }),
  correlationId: 'product-type-source-test',
};
type Table =
  | typeof products
  | typeof productTypeAssignments
  | typeof productTypes
  | typeof productTypeRevisions
  | typeof productTypeRevisionAttributes;
interface Rows {
  readonly assigned?: boolean;
  readonly foreignRule?: boolean;
  readonly revision?: number;
}
const rowsFor = (table: Table, options: Rows) => {
  if (table === products) {
    return [{ productId }];
  }
  if (table === productTypeAssignments) {
    return options.assigned === false ? [] : [{ assignmentRevision: 3, productId, productTypeId: typeId, tenantId }];
  }
  if (table === productTypes) {
    return [{ currentRevision: options.revision ?? 2, productTypeId: typeId, tenantId }];
  }
  if (table === productTypeRevisions) {
    return options.revision === 3
      ? []
      : [
          {
            effectiveAt: new Date('2026-09-16T00:00:00.000Z'),
            productTypeId: typeId,
            productTypeRevisionId: revisionId,
            revision: 2,
            tenantId,
          },
        ];
  }
  return [
    {
      attributeDefinitionId: definitionId,
      level: 'PRODUCT',
      productTypeId: typeId,
      requirement: 'REQUIRED',
      revision: 2,
      tenantId: options.foreignRule === true ? '77777777-7777-4777-8777-777777777777' : tenantId,
    },
  ];
};
const selected = (rows: readonly object[]) => ({
  where: () => {
    const result = Effect.succeed(rows);
    return Object.assign(result, { for: () => ({ limit: () => result }) });
  },
});
const transaction = (options: Rows = {}) => ({
  select: () => ({
    from: (table: Table) => selected(rowsFor(table, options)),
  }),
});

describe('Product Type Current readiness source', () => {
  it.effect('returns UNTYPED without fabricating rules', () =>
    Effect.gen(function* untyped() {
      // @ts-expect-error Mock supplies only the selected Drizzle query chain.
      const source = productTypeReadinessSourceForScope(transaction({ assigned: false }), scope);
      expect(yield* source.load(productRef, at)).toEqual({ productRef, status: 'UNTYPED' });
    }),
  );

  it.effect('returns the exact Current revision, required rule, and assignment revision', () =>
    Effect.gen(function* verified() {
      // @ts-expect-error Mock supplies only the selected Drizzle query chain.
      const source = productTypeReadinessSourceForScope(transaction(), scope);
      const result = yield* source.load(productRef, at);
      expect(result.status).toBe('VERIFIED');
      if (result.status === 'VERIFIED') {
        expect(result.assignmentRevision).toBe(3);
        expect(result.basis.revisionId).toBe(revisionId);
        expect(result.rulesRevision.rules).toMatchObject([
          { attributeDefinitionRef: { resourceId: definitionId }, level: 'PRODUCT', required: true },
        ]);
      }
    }),
  );

  it.effect('fails closed when the Current revision pointer has no matching revision', () =>
    Effect.gen(function* stale() {
      // @ts-expect-error Mock supplies only the selected Drizzle query chain.
      const source = productTypeReadinessSourceForScope(transaction({ revision: 3 }), scope);
      const result = yield* Effect.exit(source.load(productRef, at));
      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  it.effect('rejects a rule row outside the exact Tenant revision', () =>
    Effect.gen(function* foreignRule() {
      // @ts-expect-error Mock supplies only the selected Drizzle query chain.
      const source = productTypeReadinessSourceForScope(transaction({ foreignRule: true }), scope);
      const result = yield* Effect.exit(source.load(productRef, at));
      expect(Exit.isFailure(result)).toBe(true);
    }),
  );
});
