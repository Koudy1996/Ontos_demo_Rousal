import type { OperationalScope } from '@app/core-runtime';
import { ReadHandlerNotFound, ReadHandlerUnavailable, TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import { CurrentMarketCatalogRequestSchema } from '../../shared/apis/current-market-catalog.ts';
import { MarketHistoryRequestSchema } from '../../shared/apis/market-history.ts';
import { handleCurrentMarketCatalog } from '../../src/api/current-market-catalog.read.ts';
import { handleMarketHistory } from '../../src/api/market-history.read.ts';
import {
  marketCatalogCompletenessGenerations,
  marketDefinitionRevisions,
  marketLifecyclePeriods,
  markets,
  storefrontAssociationRevisions,
  storefrontAssociations,
} from '../../src/database/schema.ts';
import {
  MarketCatalogReadPersistenceUnavailable,
  marketCatalogReadPersistenceForScope,
} from '../../src/persistence/market-catalog-read-persistence.ts';
import type { MarketCatalogReadPersistence } from '../../src/persistence/market-catalog-read-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const foreignTenantId = '22222222-2222-4222-8222-222222222222';
const sellerId = '33333333-3333-4333-8333-333333333333';
const principalId = '44444444-4444-4444-8444-444444444444';
const marketId = '55555555-5555-4555-8555-555555555555';
const definitionRevisionOneId = '66666666-6666-4666-8666-666666666666';
const definitionRevisionTwoId = '77777777-7777-4777-8777-777777777777';
const associationId = '88888888-8888-4888-8888-888888888888';
const actionId = '99999999-9999-4999-8999-999999999999';
const january = new Date('2030-01-01T00:00:00.000Z');
const february = new Date('2030-02-01T00:00:00.000Z');
const march = '2030-03-01T00:00:00.000Z';

const scope: OperationalScope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authBindingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    authContextRef: 'session:market-catalog-owner-reads',
    authMethod: 'session',
    legalEntityId: sellerId,
    principalId,
    tenantId,
  }),
  correlationId: 'market-catalog-owner-reads-test',
};

const marketRows = [
  {
    aggregateRevision: 3,
    businessCode: 'CZ_MAIN',
    createdAt: january,
    createdByActionInvocationId: actionId,
    createdByPrincipalId: principalId,
    currentDefinitionRevision: 2,
    currentDefinitionRevisionId: definitionRevisionTwoId,
    marketId,
    sellingLegalEntityId: sellerId,
    tenantId,
  },
] as const;

const definitionRows = [
  {
    actingPrincipalId: principalId,
    actionInvocationId: actionId,
    changeReason: 'Initial definition',
    channels: ['B2C'],
    effectiveFrom: january,
    effectiveTo: null,
    jurisdictions: [{ code: 'CZ', kind: 'COUNTRY' }],
    marketDefinitionRevisionId: definitionRevisionOneId,
    marketId,
    purpose: 'Initial Czech commerce',
    recordedAt: january,
    revisionNumber: 1,
    sellingLegalEntityId: sellerId,
    supportedLocales: ['cs-CZ'],
    tenantId,
  },
  {
    actingPrincipalId: principalId,
    actionInvocationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    changeReason: 'Add business channel',
    channels: ['B2C', 'B2B'],
    effectiveFrom: february,
    effectiveTo: null,
    jurisdictions: [{ code: 'CZ', kind: 'COUNTRY' }],
    marketDefinitionRevisionId: definitionRevisionTwoId,
    marketId,
    purpose: 'Czech retail and business commerce',
    recordedAt: february,
    revisionNumber: 2,
    sellingLegalEntityId: sellerId,
    supportedLocales: ['cs-CZ', 'en-CZ'],
    tenantId,
  },
] as const;

const lifecycleRows = [
  {
    actingPrincipalId: principalId,
    actionInvocationId: actionId,
    effectiveFrom: january,
    effectiveTo: null,
    lifecycle: 'ACTIVE',
    marketId,
    marketLifecyclePeriodId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    reason: 'Initial activation',
    recordedAt: january,
    retirementImpactAssessment: null,
    revisionNumber: 1,
    sellingLegalEntityId: sellerId,
    tenantId,
  },
] as const;

const associationHeadRows = [
  {
    createdAt: january,
    createdByActionInvocationId: actionId,
    createdByPrincipalId: principalId,
    currentRevision: 2,
    sellingLegalEntityId: sellerId,
    storefrontAssociationId: associationId,
    tenantId,
  },
] as const;

const associationRows = [
  {
    actingPrincipalId: principalId,
    actionInvocationId: actionId,
    channel: 'B2C',
    effectiveFrom: january,
    effectiveTo: null,
    marketDefinitionRevisionId: definitionRevisionOneId,
    marketId,
    provenanceKind: 'CONFIGURATION_ACTION',
    provenanceReference: 'fixture:v1',
    reason: 'Initial association',
    recordedAt: january,
    removedAt: null,
    revisionNumber: 1,
    sellingLegalEntityId: sellerId,
    storefrontAppId: 'czech-storefront',
    storefrontAssociationId: associationId,
    storefrontAssociationRevisionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    tenantId,
  },
  {
    actingPrincipalId: principalId,
    actionInvocationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    channel: 'B2B',
    effectiveFrom: february,
    effectiveTo: null,
    marketDefinitionRevisionId: definitionRevisionTwoId,
    marketId,
    provenanceKind: 'CONFIGURATION_ACTION',
    provenanceReference: 'fixture:v2',
    reason: 'Enable business association',
    recordedAt: february,
    removedAt: null,
    revisionNumber: 2,
    sellingLegalEntityId: sellerId,
    storefrontAppId: 'czech-storefront',
    storefrontAssociationId: associationId,
    storefrontAssociationRevisionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    tenantId,
  },
] as const;

type ReadTable =
  | typeof marketCatalogCompletenessGenerations
  | typeof marketDefinitionRevisions
  | typeof marketLifecyclePeriods
  | typeof markets
  | typeof storefrontAssociationRevisions
  | typeof storefrontAssociations;

interface RowsOptions {
  readonly definitions?: readonly object[];
  readonly unavailableTable?: ReadTable;
}

const rowsFor = (table: ReadTable, options: RowsOptions): readonly object[] => {
  if (table === markets) {
    return marketRows;
  }
  if (table === marketDefinitionRevisions) {
    return options.definitions ?? definitionRows;
  }
  if (table === marketLifecyclePeriods) {
    return lifecycleRows;
  }
  if (table === storefrontAssociations) {
    return associationHeadRows;
  }
  if (table === storefrontAssociationRevisions) {
    return associationRows;
  }
  if (table === marketCatalogCompletenessGenerations) {
    return [{ generation: 7, lastActionInvocationId: actionId, tenantId, updatedAt: february }];
  }
  return [];
};

const transactionFor = (options: RowsOptions = {}) => ({
  select: () => ({
    from: (table: ReadTable) => ({
      where: () =>
        table === options.unavailableTable
          ? Effect.fail(new Error('Owner read unavailable'))
          : Effect.succeed(rowsFor(table, options)),
    }),
  }),
});

const persistenceFor = (options: RowsOptions = {}) =>
  // @ts-expect-error Only the exercised owner-local Drizzle select chains are mocked.
  marketCatalogReadPersistenceForScope(transactionFor(options), scope);

const currentInput = Schema.decodeUnknownSync(CurrentMarketCatalogRequestSchema)({ at: march });
const historyInput = Schema.decodeUnknownSync(MarketHistoryRequestSchema)({
  marketRef: {
    moduleId: 'commerce.market-catalog',
    resourceId: marketId,
    resourceType: 'commerce.market-catalog.market',
    tenantId,
  },
});

describe('Commerce Market Catalog owner reads', () => {
  it.effect('returns the latest applicable owner facts with generation-backed completeness', () =>
    Effect.gen(function* currentOwnerFacts() {
      const persistence = yield* persistenceFor();
      const result = yield* persistence.current(currentInput);

      expect(result.markets).toHaveLength(1);
      expect(result.markets[0]).toMatchObject({
        definitionRevisionRef: { resourceId: definitionRevisionTwoId },
        lifecycle: 'ACTIVE',
        previousDefinitionRevisionRef: { resourceId: definitionRevisionOneId },
        revision: 2,
      });
      expect(result.associations).toHaveLength(1);
      expect(result.associations[0]).toMatchObject({
        channel: 'B2B',
        marketDefinitionRevisionRef: { resourceId: definitionRevisionTwoId },
        previousAssociationRevision: 1,
        revision: 2,
      });
      expect(result.completenessEvidence).toMatchObject({
        ownerRevision: 'commerce.market-catalog.current:v1:generation:7',
        scope: { kind: 'EXACT_PREDICATE' },
      });
      expect(result.completenessEvidence.scope.predicateRef).toContain(sellerId);
    }),
  );

  it.effect('retains immutable definition and association revisions in owner history', () =>
    Effect.gen(function* retainedHistory() {
      const persistence = yield* persistenceFor();
      const result = yield* persistence.history(marketId);

      expect(Option.isSome(result)).toBe(true);
      if (Option.isNone(result)) {
        return;
      }
      expect(result.value.definitions.map(({ revision }) => revision)).toEqual([1, 2]);
      expect(result.value.definitions[1]?.previousDefinitionRevisionRef?.resourceId).toBe(definitionRevisionOneId);
      expect(result.value.associations.map(({ revision }) => revision)).toEqual([1, 2]);
      expect(result.value.marketRef.resourceId).toBe(marketId);
    }),
  );

  it.effect('fails closed for incomplete revision chains and owner persistence failures', () =>
    Effect.gen(function* failClosed() {
      const incomplete = yield* persistenceFor({ definitions: [definitionRows[1]] });
      const incompleteError = yield* incomplete.current(currentInput).pipe(Effect.flip);
      expect(Schema.is(MarketCatalogReadPersistenceUnavailable)(incompleteError)).toBe(true);

      const unavailable = yield* persistenceFor({ unavailableTable: markets });
      const unavailableError = yield* unavailable.current(currentInput).pipe(Effect.flip);
      expect(Schema.is(MarketCatalogReadPersistenceUnavailable)(unavailableError)).toBe(true);
    }),
  );

  it.effect('maps owner persistence inability and cross-Tenant history lookup to governed read failures', () =>
    Effect.gen(function* governedFailures() {
      const failure = new MarketCatalogReadPersistenceUnavailable({
        code: 'market_catalog_read_persistence_unavailable',
        reason: 'fixture unavailable',
      });
      const unavailableServices: MarketCatalogReadPersistence = {
        current: () => Effect.fail(failure),
        history: () => Effect.fail(failure),
      };
      const context = { readKey: 'market-catalog-owner-reads', scope, services: unavailableServices };
      const currentError = yield* handleCurrentMarketCatalog(currentInput, context).pipe(Effect.flip);
      expect(Schema.is(ReadHandlerUnavailable)(currentError)).toBe(true);

      const foreignHistory = Schema.decodeUnknownSync(MarketHistoryRequestSchema)({
        marketRef: { ...historyInput.marketRef, tenantId: foreignTenantId },
      });
      const historyError = yield* handleMarketHistory(foreignHistory, context).pipe(Effect.flip);
      expect(Schema.is(ReadHandlerNotFound)(historyError)).toBe(true);
    }),
  );
});
