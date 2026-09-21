/* oxlint-disable effect-native/no-string-timestamp-schema -- The owner routine returns encoded PostgreSQL timestamps; this adapter decodes them into the public DateTime contract immediately; expires: 2027-03-31. */
import type { OperationalScope, ReadServiceFactory, ScopedRoutineInvocationError } from '@app/core-runtime';
import { defineScopedRoutine } from '@app/core-runtime';
import { DateTime, Effect, Option, Schema } from 'effect';

import type { EligibleMarketTuplesRequest } from '../../shared/apis/eligible-market-tuples.ts';
import { EligibleMarketTupleSchema, MarketLifecycleSchema } from '../../shared/market-contracts.ts';
import type { MarketEligibilityFact, MarketEligibilitySnapshot } from '../domain/market-resolution.ts';

const nonEmpty = Schema.String.check(Schema.isMinLength(1), Schema.isTrimmed());
const uuid = Schema.String.check(Schema.isUUID());
const AssociationIdSchema = uuid.pipe(Schema.brand('MarketResolutionAssociationId'), Schema.decodeTo(uuid));
const DefinitionRevisionIdSchema = uuid.pipe(
  Schema.brand('MarketResolutionDefinitionRevisionId'),
  Schema.decodeTo(uuid),
);
const MarketIdSchema = uuid.pipe(Schema.brand('MarketResolutionMarketId'), Schema.decodeTo(uuid));
const SellingLegalEntityIdSchema = uuid.pipe(
  Schema.brand('MarketResolutionSellingLegalEntityId'),
  Schema.decodeTo(uuid),
);
const StoredFactSchema = Schema.Struct({
  associationChannel: Schema.Literals(['B2C', 'B2B']),
  associationId: AssociationIdSchema,
  associationRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  lifecycle: MarketLifecycleSchema,
  marketDefinitionRevisionId: DefinitionRevisionIdSchema,
  marketId: MarketIdSchema,
  sellingLegalEntityId: SellingLegalEntityIdSchema,
});
const SnapshotPayloadSchema = Schema.Struct({
  facts: Schema.Array(StoredFactSchema),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  nextApplicabilityBoundary: Schema.OptionFromNullOr(nonEmpty),
  observedAt: nonEmpty,
  predicateRevision: nonEmpty,
});
const SnapshotRowSchema = Schema.Struct({ payload: SnapshotPayloadSchema });

const readMarketEligibilitySnapshotRoutine = defineScopedRoutine({
  name: 'read_market_eligibility_snapshot',
  ownerModuleKey: 'commerce.market-catalog',
  parameters: [
    { source: 'tenantId', type: 'uuid' },
    { source: 'input', type: 'jsonb' },
  ],
  resultSchema: SnapshotRowSchema,
  routineKey: 'market-resolution.read-eligibility-snapshot',
  schema: 'commerce_market_catalog',
});

export class MarketResolutionPersistenceUnavailable extends Schema.TaggedError<MarketResolutionPersistenceUnavailable>()(
  'MarketResolutionPersistenceUnavailable',
  {
    code: Schema.Literal('market_resolution_persistence_unavailable'),
    reason: Schema.String,
  },
) {}

export interface MarketResolutionPersistenceResult extends MarketEligibilitySnapshot {
  readonly generation: number;
}

export interface MarketResolutionPersistence {
  readonly load: (
    input: EligibleMarketTuplesRequest,
  ) => Effect.Effect<MarketResolutionPersistenceResult, MarketResolutionPersistenceUnavailable>;
}

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

const unavailable = (cause: unknown): MarketResolutionPersistenceUnavailable => {
  const failure = new MarketResolutionPersistenceUnavailable({
    code: 'market_resolution_persistence_unavailable',
    reason: 'Current Commerce Market eligibility could not be established',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const ownerReference = <
  const ResourceType extends
    | 'commerce.market-catalog.market'
    | 'commerce.market-catalog.market-definition-revision'
    | 'commerce.market-catalog.storefront-association',
>(
  tenantId: string,
  resourceId: string,
  resourceType: ResourceType,
) => ({
  moduleId: 'commerce.market-catalog' as const,
  resourceId,
  resourceType,
  tenantId,
});

const decodeFact = (
  tenantId: string,
  fact: typeof StoredFactSchema.Type,
): Effect.Effect<MarketEligibilityFact, MarketResolutionPersistenceUnavailable> =>
  Schema.decodeEffect(EligibleMarketTupleSchema)({
    associationRef: ownerReference(tenantId, fact.associationId, 'commerce.market-catalog.storefront-association'),
    associationRevision: fact.associationRevision,
    channel: fact.associationChannel,
    marketDefinitionRevisionRef: ownerReference(
      tenantId,
      fact.marketDefinitionRevisionId,
      'commerce.market-catalog.market-definition-revision',
    ),
    marketRef: ownerReference(tenantId, fact.marketId, 'commerce.market-catalog.market'),
    sellingLegalEntityRef: {
      moduleId: 'core.identity',
      resourceId: fact.sellingLegalEntityId,
      resourceType: 'core.identity.legal-entity',
      tenantId,
    },
  }).pipe(
    Effect.map((tuple) => ({ lifecycle: fact.lifecycle, tuple })),
    Effect.mapError(unavailable),
  );

const decodeInstant = (value: string) =>
  Schema.decodeEffect(Schema.DateTimeUtcFromString)(value).pipe(Effect.mapError(unavailable));

interface MarketEligibilityRoutineInput {
  at: string;
  channel: EligibleMarketTuplesRequest['channel'];
  sellingLegalEntityId?: string;
  storefrontAppId: string;
}

const routineInput = (input: EligibleMarketTuplesRequest) => {
  const value: MarketEligibilityRoutineInput = {
    at: DateTime.formatIso(input.at),
    channel: input.channel,
    storefrontAppId: input.storefrontRef.appId,
  };
  if (input.sellingLegalEntityRestriction !== undefined) {
    value.sellingLegalEntityId = input.sellingLegalEntityRestriction.resourceId;
  }
  return value;
};

const decodeSnapshotRow = Effect.fn('MarketResolutionPersistence.decodeSnapshotRow')(function* decodeSnapshot(
  input: EligibleMarketTuplesRequest,
  tenantId: string,
  row: typeof SnapshotRowSchema.Type,
): Effect.fn.Return<MarketResolutionPersistenceResult, MarketResolutionPersistenceUnavailable> {
  const facts = yield* Effect.forEach(row.payload.facts, (fact) => decodeFact(tenantId, fact), {
    concurrency: 1,
  });
  const observedAt = yield* decodeInstant(row.payload.observedAt);
  const nextApplicabilityBoundary = Option.isNone(row.payload.nextApplicabilityBoundary)
    ? undefined
    : yield* decodeInstant(row.payload.nextApplicabilityBoundary.value);
  const evidenceBase = {
    observedAt,
    ownerRevision: `market-eligibility:v1:${row.payload.predicateRevision}`,
    scope: {
      kind: 'EXACT_PREDICATE' as const,
      predicateRef: [
        'market-eligibility:v1',
        tenantId,
        input.storefrontRef.appId,
        input.channel,
        input.sellingLegalEntityRestriction?.resourceId ?? 'all-sellers',
      ].join(':'),
    },
  };
  const completenessEvidence =
    nextApplicabilityBoundary === undefined ? evidenceBase : { ...evidenceBase, nextApplicabilityBoundary };
  const result = {
    completenessEvidence,
    evaluatedAt: input.at,
    facts,
    generation: row.payload.generation,
  };
  return nextApplicabilityBoundary === undefined ? result : { ...result, nextApplicabilityBoundary };
});

const marketResolutionPersistenceForTransaction = (
  transaction: ScopedTransaction,
  scope: Pick<OperationalScope, 'tenantId'>,
): MarketResolutionPersistence => ({
  load: (input) =>
    transaction.invoke(readMarketEligibilitySnapshotRoutine, [routineInput(input)]).pipe(
      Effect.mapError((cause: ScopedRoutineInvocationError) => unavailable(cause)),
      Effect.flatMap(([row]) =>
        row === undefined
          ? Effect.fail(unavailable('The owner eligibility routine returned no snapshot'))
          : decodeSnapshotRow(input, scope.tenantId, row),
      ),
    ),
});

export const marketResolutionPersistenceForScope: ReadServiceFactory<MarketResolutionPersistence> = (
  transaction,
  scope,
) => Effect.succeed(marketResolutionPersistenceForTransaction(transaction, scope));
