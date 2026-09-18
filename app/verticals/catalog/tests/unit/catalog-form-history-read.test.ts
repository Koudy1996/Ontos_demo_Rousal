import { ReadHandlerNotFound, ReadHandlerUnavailable } from '@app/core-runtime';
import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { VariantHistoryRequestSchema, VariantHistoryResponseSchema } from '../../shared/apis/variant-history.ts';
import {
  PackageDefinitionHistoryRequestSchema,
  PackageDefinitionHistoryResponseSchema,
} from '../../shared/apis/package-definition-history.ts';
import {
  PackageOptionHistoryRequestSchema,
  PackageOptionHistoryResponseSchema,
} from '../../shared/apis/package-option-history.ts';
import { readVariantHistory } from '../../src/api/variant-history.read.ts';
import { readPackageDefinitionHistory } from '../../src/api/package-definition-history.read.ts';
import { readPackageOptionHistory } from '../../src/api/package-option-history.read.ts';
import { VariantHistoryForbiddenProblemSchema } from '../../shared/apis/variant-history.ts';
import { PackageDefinitionHistoryForbiddenProblemSchema } from '../../shared/apis/package-definition-history.ts';
import { PackageOptionHistoryForbiddenProblemSchema } from '../../shared/apis/package-option-history.ts';
import { variantHistoryRead } from '../../src/api/variant-history.read.ts';
import { packageDefinitionHistoryRead } from '../../src/api/package-definition-history.read.ts';
import { packageOptionHistoryRead } from '../../src/api/package-option-history.read.ts';
import type { variantHistoryForScope } from '../../src/persistence/variant-persistence.ts';
import type { packageHistoryForScope } from '../../src/persistence/package-persistence.ts';
import type { packageOptionHistoryForScope } from '../../src/persistence/package-option-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const foreignTenantId = '99999999-9999-4999-8999-999999999999';
const productId = '22222222-2222-4222-8222-222222222222';
const variantId = '33333333-3333-4333-8333-333333333333';
const definitionId = '44444444-4444-4444-8444-444444444444';
const invocationId = '55555555-5555-4555-8555-555555555555';
const date = new Date('2026-09-16T12:00:00.000Z');
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: variantId,
  resourceType: 'commerce.catalog.variant',
  tenantId,
};
const packageRef = {
  moduleId: 'commerce.catalog',
  resourceId: definitionId,
  resourceType: 'commerce.catalog.package-definition',
  tenantId,
};
const variantRequest = Schema.decodeUnknownSync(VariantHistoryRequestSchema)({
  reference: { resourceRef: variantRef, revision: 1 },
});
const contentRequest = Schema.decodeUnknownSync(PackageDefinitionHistoryRequestSchema)({
  reference: { resourceRef: packageRef, revision: 1 },
});
const roleRequest = Schema.decodeUnknownSync(PackageOptionHistoryRequestSchema)({
  reference: { resourceRef: packageRef, roleRevision: 2 },
});

const variantRow = {
  tenantId,
  productId,
  variantId,
  revision: 1,
  lifecycleState: 'WORK_IN_PROGRESS',
  combinationKey: null,
  combinationAxisRevision: null,
  changeKind: 'CREATED',
  reason: 'Original form',
  evidenceRefs: ['evidence:variant-r1'],
  actionInvocationId: invocationId,
  actingPrincipalId: productId,
  recordedAt: date,
};
const contentRow = {
  tenantId,
  packageDefinitionId: definitionId,
  productId,
  variantId,
  revision: 1,
  lifecycleState: 'ACTIVE',
  amount: '6',
  unitResourceType: 'commerce.catalog.unit',
  unitResourceId: productId,
  configurationKey: null,
  effectiveAt: date,
  lowerPackageDefinitionId: null,
  lowerRevision: null,
  lowerCount: null,
  setCompositionResourceId: null,
  setCompositionRevision: null,
  changeKind: 'MATERIAL_CHANGE',
  priorErrorExplanation: null,
  reason: 'Original six-pack',
  evidenceRefs: ['evidence:content-r1'],
  actionInvocationId: invocationId,
  actingPrincipalId: productId,
  recordedAt: date,
};
const roleRow = {
  tenantId,
  packageDefinitionId: definitionId,
  productId,
  variantId,
  revision: 2,
  contentRevision: 1,
  state: 'RETIRED',
  independentlyRequested: true,
  looseUnitsSubstitutable: false,
  validationReason: 'Retired without changing historical content',
  evidenceRefs: ['evidence:role-r2'],
  effectiveAt: date,
  actionInvocationId: invocationId,
  actingPrincipalId: productId,
  recordedAt: date,
};

const variantServices = (row: Option.Option<typeof variantRow>) =>
  ({
    getRevision: (_id: string, _revision: number) => Effect.succeed(row),
  }) as unknown as ReturnType<typeof variantHistoryForScope>;
const contentServices = (row: Option.Option<typeof contentRow>) =>
  ({
    getContentRevision: (_id: string, _revision: number) => Effect.succeed(row),
  }) as unknown as ReturnType<typeof packageHistoryForScope>;
const roleServices = (row: Option.Option<typeof roleRow>) =>
  ({
    getRoleRevision: (_id: string, _revision: number) => Effect.succeed(row),
  }) as unknown as ReturnType<typeof packageOptionHistoryForScope>;

describe('exact Catalog form history reads', () => {
  it.effect('returns retained Variant R1 rather than Current R2 and round-trips its provenance', () =>
    Effect.gen(function* () {
      const response = yield* readVariantHistory(variantRequest, tenantId, variantServices(Option.some(variantRow)));
      expect(response.result).toMatchObject({
        historical: true,
        lifecycle: 'WORK_IN_PROGRESS',
        changeKind: 'CREATED',
        evidenceRefs: ['evidence:variant-r1'],
      });
      expect(response.result.reference).toEqual(variantRequest.reference);
      expect(Schema.encodeSync(VariantHistoryResponseSchema)(response.result)).toMatchObject({
        recordedAt: date.toISOString(),
      });
    }),
  );

  it.effect('returns pinned Package content R1, including lower and Set references, not changed Current content', () =>
    Effect.gen(function* () {
      const response = yield* readPackageDefinitionHistory(
        contentRequest,
        tenantId,
        contentServices(Option.some(contentRow)),
      );
      expect(response.result).toMatchObject({
        historical: true,
        amount: '6',
        evidenceRefs: ['evidence:content-r1'],
        lowerRevision: null,
        setCompositionRevision: null,
      });
      expect(response.result.reference).toEqual(contentRequest.reference);
      expect(() => Schema.encodeSync(PackageDefinitionHistoryResponseSchema)(response.result)).not.toThrow();
    }),
  );

  it.effect('looks up Option role revision independently of its pinned content revision', () =>
    Effect.gen(function* () {
      let queriedRevision = 0;
      const services = {
        getRoleRevision: (_id: string, revision: number) => {
          queriedRevision = revision;
          return Effect.succeed(Option.some(roleRow));
        },
      } as unknown as ReturnType<typeof packageOptionHistoryForScope>;
      const response = yield* readPackageOptionHistory(roleRequest, tenantId, services);
      expect(queriedRevision).toBe(2);
      expect(response.result).toMatchObject({
        contentRevision: 1,
        state: 'RETIRED',
        evidenceRefs: ['evidence:role-r2'],
      });
      expect(response.result.reference).toEqual(roleRequest.reference);
      expect(() => Schema.encodeSync(PackageOptionHistoryResponseSchema)(response.result)).not.toThrow();
    }),
  );

  it.effect('denies foreign Tenant before querying and returns the same not-found type for absent revisions', () =>
    Effect.gen(function* () {
      const foreign = yield* readVariantHistory(
        variantRequest,
        foreignTenantId,
        variantServices(Option.some(variantRow)),
      ).pipe(Effect.flip);
      const missing = yield* readVariantHistory(variantRequest, tenantId, variantServices(Option.none())).pipe(
        Effect.flip,
      );
      expect(Schema.is(ReadHandlerNotFound)(foreign)).toBe(true);
      expect(Schema.is(ReadHandlerNotFound)(missing)).toBe(true);
      expect(foreign.reason).toBe(missing.reason);
    }),
  );

  it.effect('maps missing Package content or Option role to not found, not a Current fallback', () =>
    Effect.gen(function* () {
      const missingContent = yield* readPackageDefinitionHistory(
        contentRequest,
        tenantId,
        contentServices(Option.none()),
      ).pipe(Effect.flip);
      const missingRole = yield* readPackageOptionHistory(roleRequest, tenantId, roleServices(Option.none())).pipe(
        Effect.flip,
      );
      expect(Schema.is(ReadHandlerNotFound)(missingContent)).toBe(true);
      expect(Schema.is(ReadHandlerNotFound)(missingRole)).toBe(true);
    }),
  );

  it.effect('fails closed when retained evidence storage is unavailable', () =>
    Effect.gen(function* () {
      const unavailableServices = {
        getContentRevision: () => Effect.fail(new Error('private database detail')),
      } as unknown as ReturnType<typeof packageHistoryForScope>;
      const failure = yield* readPackageDefinitionHistory(contentRequest, tenantId, unavailableServices).pipe(
        Effect.flip,
      );
      expect(Schema.is(ReadHandlerUnavailable)(failure)).toBe(true);
      expect(JSON.stringify(failure)).not.toContain('private database detail');
    }),
  );
});

it('rejects invented revision IDs and ambiguous Option content-only references at the public boundary', () => {
  for (const [schema, reference] of [
    [VariantHistoryRequestSchema, { ...variantRequest.reference, revisionId: invocationId }],
    [PackageDefinitionHistoryRequestSchema, { ...contentRequest.reference, revisionId: invocationId }],
    [PackageOptionHistoryRequestSchema, { ...roleRequest.reference, revisionId: invocationId }],
  ] as const) {
    expect(() => Schema.decodeUnknownSync(schema)({ reference })).toThrow();
  }
  expect(() =>
    Schema.decodeUnknownSync(PackageOptionHistoryRequestSchema)({
      reference: { resourceRef: packageRef, revision: 1 },
    }),
  ).toThrow();
});

it('keeps all three historical endpoints behind current context permission and a sanitized 403', () => {
  for (const [read, schema] of [
    [variantHistoryRead, VariantHistoryForbiddenProblemSchema],
    [packageDefinitionHistoryRead, PackageDefinitionHistoryForbiddenProblemSchema],
    [packageOptionHistoryRead, PackageOptionHistoryForbiddenProblemSchema],
  ] as const) {
    expect(read.descriptor.entrypoint.access).toBe('historical_read');
    expect(read.descriptor.entrypoint.authorization.kind).toBe('context_permission');
    const denial = schema.make({
      detail: 'The principal is not permitted to perform this read.',
      status: 403,
      title: 'Read forbidden',
      type: 'https://ontos.dev/problems/read-forbidden',
    });
    expect(Schema.encodeSync(schema)(denial)).toMatchObject({ status: 403 });
    expect(JSON.stringify(denial)).not.toContain(tenantId);
  }
});
