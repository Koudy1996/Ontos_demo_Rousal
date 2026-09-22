import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { OperationContextUnavailable } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { DateTime, Effect, Option, Schema } from 'effect';

import type {
  CurrentMarketCatalogRequest,
  CurrentMarketCatalogResponse,
} from '../../shared/apis/current-market-catalog.ts';
import { CurrentMarketCatalogResponseSchema } from '../../shared/apis/current-market-catalog.ts';
import type { MarketHistoryResponse } from '../../shared/apis/market-history.ts';
import { MarketHistoryResponseSchema } from '../../shared/apis/market-history.ts';
import {
  marketCatalogCompletenessGenerations,
  marketDefinitionRevisions,
  marketLifecyclePeriods,
  markets,
  storefrontAssociationRevisions,
  storefrontAssociations,
} from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
type MarketRow = typeof markets.$inferSelect;
type DefinitionRow = typeof marketDefinitionRevisions.$inferSelect;
type LifecycleRow = typeof marketLifecyclePeriods.$inferSelect;
type AssociationRow = typeof storefrontAssociationRevisions.$inferSelect;
type AssociationHeadRow = typeof storefrontAssociations.$inferSelect;
type GenerationRow = typeof marketCatalogCompletenessGenerations.$inferSelect;

interface ScopedRows {
  readonly associationHeads: readonly AssociationHeadRow[];
  readonly associations: readonly AssociationRow[];
  readonly definitions: readonly DefinitionRow[];
  readonly generations: readonly GenerationRow[];
  readonly lifecycles: readonly LifecycleRow[];
  readonly markets: readonly MarketRow[];
}

export class MarketCatalogReadPersistenceUnavailable extends Schema.TaggedError<MarketCatalogReadPersistenceUnavailable>()(
  'MarketCatalogReadPersistenceUnavailable',
  {
    code: Schema.Literal('market_catalog_read_persistence_unavailable'),
    reason: Schema.String,
  },
) {}

export interface MarketCatalogReadPersistence {
  readonly current: (
    input: CurrentMarketCatalogRequest,
  ) => Effect.Effect<CurrentMarketCatalogResponse, MarketCatalogReadPersistenceUnavailable>;
  readonly history: (
    marketId: string,
  ) => Effect.Effect<Option.Option<MarketHistoryResponse>, MarketCatalogReadPersistenceUnavailable>;
}

interface TemporalRevision {
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly revisionNumber: number;
}

const unavailable = (cause?: unknown) => {
  const failure = new MarketCatalogReadPersistenceUnavailable({
    code: 'market_catalog_read_persistence_unavailable',
    reason: 'Commerce Market Catalog owner state is temporarily unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

const validDate = (value: Date | null): boolean => value === null || !Number.isNaN(value.getTime());

const latestApplicableBy = <Row extends TemporalRevision>(
  rows: readonly Row[],
  at: Date,
  keyOf: (row: Row) => string,
): ReadonlyMap<string, Row> | null => {
  const latest = new Map<string, Row>();
  for (const row of rows) {
    if (
      !validDate(row.effectiveFrom) ||
      !validDate(row.effectiveTo) ||
      !Number.isSafeInteger(row.revisionNumber) ||
      row.revisionNumber < 1
    ) {
      return null;
    }
    if (row.effectiveFrom <= at && (row.effectiveTo === null || at < row.effectiveTo)) {
      const key = keyOf(row);
      const previous = latest.get(key);
      if (previous !== undefined && row.revisionNumber === previous.revisionNumber) {
        return null;
      }
      if (previous === undefined || row.revisionNumber > previous.revisionNumber) {
        latest.set(key, row);
      }
    }
  }
  return latest;
};

const marketCatalogModuleId = 'commerce.market-catalog' as const;

const marketReference = (tenantId: string, marketId: string) => ({
  moduleId: marketCatalogModuleId,
  resourceId: marketId,
  resourceType: 'commerce.market-catalog.market' as const,
  tenantId,
});

const definitionReference = (tenantId: string, revisionId: string) => ({
  moduleId: marketCatalogModuleId,
  resourceId: revisionId,
  resourceType: 'commerce.market-catalog.market-definition-revision' as const,
  tenantId,
});

const associationReference = (tenantId: string, associationId: string) => ({
  moduleId: marketCatalogModuleId,
  resourceId: associationId,
  resourceType: 'commerce.market-catalog.storefront-association' as const,
  tenantId,
});

const sellerReference = (tenantId: string, legalEntityId: string) => ({
  moduleId: 'core.identity' as const,
  resourceId: legalEntityId,
  resourceType: 'core.identity.legal-entity' as const,
  tenantId,
});

const period = (startsAt: Date, endsAt: Date | null) =>
  endsAt === null
    ? { startsAt: DateTime.formatIso(DateTime.makeUnsafe(startsAt)) }
    : {
        endsAt: DateTime.formatIso(DateTime.makeUnsafe(endsAt)),
        startsAt: DateTime.formatIso(DateTime.makeUnsafe(startsAt)),
      };

const definitionValue = (
  head: MarketRow,
  definition: DefinitionRow,
  lifecycle: LifecycleRow,
  definitions: readonly DefinitionRow[],
) => {
  const previous =
    definition.revisionNumber === 1
      ? undefined
      : definitions.find(
          (candidate) =>
            candidate.marketId === definition.marketId && candidate.revisionNumber === definition.revisionNumber - 1,
        );
  if (definition.revisionNumber > 1 && previous === undefined) {
    return null;
  }
  const value = {
    channels: definition.channels,
    definitionRevisionRef: definitionReference(definition.tenantId, definition.marketDefinitionRevisionId),
    effectivePeriod: period(definition.effectiveFrom, definition.effectiveTo),
    jurisdictions: definition.jurisdictions,
    lifecycle: lifecycle.lifecycle,
    marketCode: head.businessCode,
    marketRef: marketReference(head.tenantId, head.marketId),
    purpose: definition.purpose,
    revision: definition.revisionNumber,
    sellingLegalEntityRef: sellerReference(head.tenantId, head.sellingLegalEntityId),
    supportedLocales: definition.supportedLocales,
  };
  return previous === undefined
    ? value
    : {
        ...value,
        previousDefinitionRevisionRef: definitionReference(previous.tenantId, previous.marketDefinitionRevisionId),
      };
};

const associationValue = (association: AssociationRow) => {
  const value = {
    associationRef: associationReference(association.tenantId, association.storefrontAssociationId),
    channel: association.channel,
    effectivePeriod: period(association.effectiveFrom, association.effectiveTo),
    marketDefinitionRevisionRef: definitionReference(association.tenantId, association.marketDefinitionRevisionId),
    marketRef: marketReference(association.tenantId, association.marketId),
    provenance: { kind: association.provenanceKind, reference: association.provenanceReference },
    revision: association.revisionNumber,
    sellingLegalEntityRef: sellerReference(association.tenantId, association.sellingLegalEntityId),
    storefrontRef: { appId: association.storefrontAppId, tenantId: association.tenantId },
  };
  return association.revisionNumber === 1
    ? value
    : { ...value, previousAssociationRevision: association.revisionNumber - 1 };
};

const rowsForScope = Effect.fn('MarketCatalogReadPersistence.rowsForScope')(function* rowsForScope(
  transaction: ScopedTransaction,
  tenantId: string,
  legalEntityId: string,
) {
  return yield* Effect.all(
    {
      associationHeads: transaction
        .select()
        .from(storefrontAssociations)
        .where(
          and(
            eq(storefrontAssociations.tenantId, tenantId),
            eq(storefrontAssociations.sellingLegalEntityId, legalEntityId),
          ),
        ),
      associations: transaction
        .select()
        .from(storefrontAssociationRevisions)
        .where(
          and(
            eq(storefrontAssociationRevisions.tenantId, tenantId),
            eq(storefrontAssociationRevisions.sellingLegalEntityId, legalEntityId),
          ),
        ),
      definitions: transaction
        .select()
        .from(marketDefinitionRevisions)
        .where(
          and(
            eq(marketDefinitionRevisions.tenantId, tenantId),
            eq(marketDefinitionRevisions.sellingLegalEntityId, legalEntityId),
          ),
        ),
      generations: transaction
        .select()
        .from(marketCatalogCompletenessGenerations)
        .where(eq(marketCatalogCompletenessGenerations.tenantId, tenantId)),
      lifecycles: transaction
        .select()
        .from(marketLifecyclePeriods)
        .where(
          and(
            eq(marketLifecyclePeriods.tenantId, tenantId),
            eq(marketLifecyclePeriods.sellingLegalEntityId, legalEntityId),
          ),
        ),
      markets: transaction
        .select()
        .from(markets)
        .where(and(eq(markets.tenantId, tenantId), eq(markets.sellingLegalEntityId, legalEntityId))),
    },
    { concurrency: 1 },
  ).pipe(Effect.mapError(unavailable));
});

const validScopedRows = (rows: ScopedRows, tenantId: string, legalEntityId: string) =>
  rows.generations.length <= 1 &&
  rows.markets.every(
    (row) =>
      row.tenantId === tenantId &&
      row.sellingLegalEntityId === legalEntityId &&
      row.currentDefinitionRevisionId !== null,
  ) &&
  rows.definitions.every(
    (row) => row.tenantId === tenantId && row.sellingLegalEntityId === legalEntityId && validDate(row.recordedAt),
  ) &&
  rows.lifecycles.every(
    (row) => row.tenantId === tenantId && row.sellingLegalEntityId === legalEntityId && validDate(row.recordedAt),
  ) &&
  rows.associationHeads.every(
    (row) => row.tenantId === tenantId && row.sellingLegalEntityId === legalEntityId && validDate(row.createdAt),
  ) &&
  rows.associations.every(
    (row) =>
      row.tenantId === tenantId &&
      row.sellingLegalEntityId === legalEntityId &&
      validDate(row.recordedAt) &&
      validDate(row.removedAt),
  );

const makePersistence = (
  transaction: ScopedTransaction,
  scope: OperationalScope & { readonly legalEntityId: string },
): MarketCatalogReadPersistence => {
  const { legalEntityId, tenantId } = scope;

  const current: MarketCatalogReadPersistence['current'] = Effect.fn('MarketCatalogReadPersistence.current')(
    function* currentCatalog(input) {
      const rows = yield* rowsForScope(transaction, tenantId, legalEntityId);
      if (!validScopedRows(rows, tenantId, legalEntityId)) {
        return yield* unavailable('The owner catalog rows are inconsistent with the trusted scope');
      }
      const at = DateTime.toDateUtc(input.at);
      const currentDefinitions = latestApplicableBy(rows.definitions, at, (row) => row.marketId);
      const currentLifecycles = latestApplicableBy(rows.lifecycles, at, (row) => row.marketId);
      const currentAssociations = latestApplicableBy(
        rows.associations.filter((row) => row.removedAt === null || row.removedAt > at),
        at,
        (row) => row.storefrontAssociationId,
      );
      if (currentDefinitions === null || currentLifecycles === null || currentAssociations === null) {
        return yield* unavailable('The owner catalog contains invalid temporal revision evidence');
      }

      const marketValues: unknown[] = [];
      const currentMarketIds = new Set<string>();
      for (const head of rows.markets.toSorted((left, right) => left.marketId.localeCompare(right.marketId))) {
        const definition = currentDefinitions.get(head.marketId);
        const lifecycle = currentLifecycles.get(head.marketId);
        if (definition === undefined && lifecycle === undefined) {
          continue;
        }
        if (definition === undefined || lifecycle === undefined) {
          return yield* unavailable('A Current Market lacks definition or lifecycle evidence');
        }
        const value = definitionValue(head, definition, lifecycle, rows.definitions);
        if (value === null) {
          return yield* unavailable('A Current Market definition has incomplete revision history');
        }
        currentMarketIds.add(head.marketId);
        marketValues.push(value);
      }

      const associationHeadIds = new Set(rows.associationHeads.map((row) => row.storefrontAssociationId));
      const associationValues: unknown[] = [];
      for (const association of [...currentAssociations.values()].toSorted((left, right) =>
        left.storefrontAssociationId.localeCompare(right.storefrontAssociationId),
      )) {
        if (
          !associationHeadIds.has(association.storefrontAssociationId) ||
          !currentMarketIds.has(association.marketId)
        ) {
          return yield* unavailable('A Current Storefront association lacks its owner Market identity');
        }
        associationValues.push(associationValue(association));
      }

      const generation = rows.generations[0]?.generation ?? 0;
      if (
        !Number.isSafeInteger(generation) ||
        generation < 0 ||
        (rows.markets.length > 0 && rows.generations.length === 0)
      ) {
        return yield* unavailable('The owner catalog completeness generation is unavailable');
      }
      const observedAt = yield* DateTime.now;
      return yield* Schema.decodeUnknownEffect(CurrentMarketCatalogResponseSchema)({
        associations: associationValues,
        completenessEvidence: {
          observedAt: DateTime.formatIso(observedAt),
          ownerRevision: `commerce.market-catalog.current:v1:generation:${generation}`,
          scope: {
            kind: 'EXACT_PREDICATE',
            predicateRef: `commerce.market-catalog.current:v1:${tenantId}:${legalEntityId}:${DateTime.formatIso(input.at)}`,
          },
        },
        markets: marketValues,
        observedAt: DateTime.formatIso(observedAt),
      }).pipe(Effect.mapError(unavailable));
    },
  );

  const history: MarketCatalogReadPersistence['history'] = Effect.fn('MarketCatalogReadPersistence.history')(
    function* marketHistory(marketId) {
      const rows = yield* rowsForScope(transaction, tenantId, legalEntityId);
      if (!validScopedRows(rows, tenantId, legalEntityId)) {
        return yield* unavailable('The owner catalog rows are inconsistent with the trusted scope');
      }
      const head = rows.markets.find((row) => row.marketId === marketId);
      if (head === undefined) {
        return Option.none();
      }
      const definitions = rows.definitions
        .filter((row) => row.marketId === marketId)
        .toSorted((left, right) => left.revisionNumber - right.revisionNumber);
      const lifecycles = rows.lifecycles.filter((row) => row.marketId === marketId);
      if (definitions.length === 0) {
        return yield* unavailable('The Market identity has no retained definition history');
      }
      const definitionValues: unknown[] = [];
      for (const definition of definitions) {
        const applicableLifecycles = latestApplicableBy(lifecycles, definition.effectiveFrom, (row) => row.marketId);
        const lifecycle = applicableLifecycles === null ? undefined : applicableLifecycles.get(marketId);
        const value = lifecycle === undefined ? undefined : definitionValue(head, definition, lifecycle, definitions);
        if (value === undefined || value === null) {
          return yield* unavailable('The retained Market history is incomplete');
        }
        definitionValues.push(value);
      }
      const associationValues = rows.associations
        .filter((row) => row.marketId === marketId)
        .toSorted(
          (left, right) =>
            left.storefrontAssociationId.localeCompare(right.storefrontAssociationId) ||
            left.revisionNumber - right.revisionNumber,
        )
        .map(associationValue);
      const response = yield* Schema.decodeUnknownEffect(MarketHistoryResponseSchema)({
        associations: associationValues,
        definitions: definitionValues,
        marketRef: marketReference(tenantId, marketId),
      }).pipe(Effect.mapError(unavailable));
      return Option.some(response);
    },
  );

  return Object.freeze({ current, history });
};

export const marketCatalogReadPersistenceForScope: ReadServiceFactory<MarketCatalogReadPersistence> = (
  transaction,
  scope,
) => {
  const { legalEntityId } = scope;
  return legalEntityId === undefined
    ? Effect.fail(
        new OperationContextUnavailable({
          code: 'operation_context_unavailable',
          reason: 'Commerce Market Catalog reads require a trusted Legal Entity scope',
        }),
      )
    : Effect.succeed(makePersistence(transaction, { ...scope, legalEntityId }));
};
