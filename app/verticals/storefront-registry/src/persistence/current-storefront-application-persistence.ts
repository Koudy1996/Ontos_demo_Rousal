/* oxlint-disable effect-native/no-string-timestamp-schema -- The owner routine returns already encoded canonical UTC instants; expires: 2027-03-31. */
import type { ReadServiceFactory, ScopedRoutineInvocationError } from '@app/core-runtime';
import { defineScopedRoutine } from '@app/core-runtime';
import type { CurrentStorefrontApplicationRequest } from '@app/storefront-registry-contracts';
import { DateTime, Effect, Option, Schema } from 'effect';

const instant = Schema.String.check(Schema.isMinLength(1), Schema.isTrimmed());
const positiveRevision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const generation = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const StoredCurrentSchema = Schema.Struct({
  allowedChannels: Schema.Array(Schema.Literals(['B2C', 'B2B'])).check(Schema.isMinLength(1)),
  effectiveFrom: instant,
  effectiveTo: Schema.OptionFromNullOr(instant),
  generation,
  lifecycle: Schema.Literals(['DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED']),
  observedAt: instant,
  revision: positiveRevision,
});
const SnapshotPayloadSchema = Schema.Union([
  Schema.TaggedStruct('found', { current: StoredCurrentSchema }),
  Schema.TaggedStruct('not_found', { generation, observedAt: instant }),
]);
const SnapshotRowSchema = Schema.Struct({ payload: SnapshotPayloadSchema });

const readCurrentStorefrontApplicationRoutine = defineScopedRoutine({
  name: 'read_current_storefront_application',
  ownerModuleKey: 'commerce.storefront-registry',
  parameters: [
    { source: 'tenantId', type: 'uuid' },
    { source: 'input', type: 'jsonb' },
  ],
  resultSchema: SnapshotRowSchema,
  routineKey: 'storefront-application.read-current',
  schema: 'storefront_registry',
});

export class StorefrontRegistryPersistenceUnavailable extends Schema.TaggedError<StorefrontRegistryPersistenceUnavailable>()(
  'StorefrontRegistryPersistenceUnavailable',
  {
    code: Schema.Literal('storefront_registry_persistence_unavailable'),
    reason: Schema.String,
  },
) {}

export interface CurrentStorefrontApplicationSnapshot {
  readonly allowedChannels: readonly ('B2B' | 'B2C')[];
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly generation: number;
  readonly lifecycle: 'ACTIVE' | 'DRAFT' | 'RETIRED' | 'SUSPENDED';
  readonly observedAt: string;
  readonly revision: number;
}

export interface CurrentStorefrontApplicationPersistenceResult {
  readonly generation: number;
  readonly observedAt: string;
  readonly snapshot: Option.Option<CurrentStorefrontApplicationSnapshot>;
}

export interface CurrentStorefrontApplicationPersistence {
  readonly load: (
    input: CurrentStorefrontApplicationRequest,
  ) => Effect.Effect<CurrentStorefrontApplicationPersistenceResult, StorefrontRegistryPersistenceUnavailable>;
}

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

const unavailable = (cause: unknown): StorefrontRegistryPersistenceUnavailable => {
  const failure = new StorefrontRegistryPersistenceUnavailable({
    code: 'storefront_registry_persistence_unavailable',
    reason: 'Current Storefront application authority is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const canonicalInstant = (value: string) =>
  Schema.decodeEffect(Schema.DateTimeUtcFromString)(value).pipe(
    Effect.map(DateTime.formatIso),
    Effect.mapError(unavailable),
  );

const decodeRow = Effect.fn('CurrentStorefrontApplicationPersistence.decodeRow')(function* decodeSnapshot(
  row: typeof SnapshotRowSchema.Type,
): Effect.fn.Return<CurrentStorefrontApplicationPersistenceResult, StorefrontRegistryPersistenceUnavailable> {
  if (row.payload._tag === 'not_found') {
    return {
      generation: row.payload.generation,
      observedAt: yield* canonicalInstant(row.payload.observedAt),
      snapshot: Option.none(),
    };
  }
  const { current } = row.payload;
  const effectiveTo = Option.isNone(current.effectiveTo)
    ? undefined
    : yield* canonicalInstant(current.effectiveTo.value);
  const snapshot = {
    allowedChannels: current.allowedChannels,
    effectiveFrom: yield* canonicalInstant(current.effectiveFrom),
    generation: current.generation,
    lifecycle: current.lifecycle,
    observedAt: yield* canonicalInstant(current.observedAt),
    revision: current.revision,
    ...(effectiveTo === undefined ? {} : { effectiveTo }),
  };
  return { generation: current.generation, observedAt: snapshot.observedAt, snapshot: Option.some(snapshot) };
});

const persistenceForTransaction = (
  transaction: ScopedTransaction,
  tenantId: string,
): CurrentStorefrontApplicationPersistence => ({
  load: (input) =>
    transaction
      .invoke(readCurrentStorefrontApplicationRoutine, [
        { effectiveAt: input.effectiveAt, storefrontAppId: input.storefrontAppId },
      ])
      .pipe(
        Effect.mapError((cause: ScopedRoutineInvocationError) => unavailable(cause)),
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.fail(unavailable('The Storefront Registry owner routine returned no snapshot'))
            : input.tenantId !== tenantId
              ? Effect.fail(unavailable('The Storefront Registry request Tenant does not match the trusted scope'))
              : decodeRow(row),
        ),
      ),
});

export const currentStorefrontApplicationPersistenceForScope: ReadServiceFactory<CurrentStorefrontApplicationPersistence> =
  (transaction, scope) => Effect.succeed(persistenceForTransaction(transaction, scope.tenantId));
