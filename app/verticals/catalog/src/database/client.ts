/* oxlint-disable effect-native/no-effect-provide-in-library -- Native Drizzle executor construction is the owner database factory boundary. expires: 2027-03-31. */
import type { DatabasePoolDeadlines } from '@app/core-runtime';
import { configureDatabasePool, DatabaseConfig } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import type { Scope } from 'effect';
import { Context, Effect, Layer, Redacted } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import type { PoolConfig } from 'pg';
import { Pool } from 'pg';

import { CatalogDatabaseConnectionError } from './connection-error.ts';
import { catalogRelations } from './schema.ts';
import type { CatalogDatabaseExecutor } from './types.ts';

export class CatalogDatabase extends Context.Service<CatalogDatabase, { readonly executor: CatalogDatabaseExecutor }>()(
  '@app/catalog/database/client/CatalogDatabase',
) {}

export interface CatalogPoolResource {
  // oxlint-disable-next-line effect-native/no-promise-shaped-port -- pg owns this foreign driver finalizer shape.
  readonly end: () => Promise<void>;
}

const connectionFailure = (cause: unknown): CatalogDatabaseConnectionError => {
  const failure = new CatalogDatabaseConnectionError({
    reason: 'Unable to initialize the Catalog PostgreSQL connection pool',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

export type CatalogPoolFactory = (configuration: PoolConfig) => Pool;
const defaultPoolFactory: CatalogPoolFactory = (configuration) => new Pool(configuration);

type ContextServiceContract<Service> =
  Service extends Context.Key<infer _Identifier, infer Contract> ? Contract : never;

export const makeCatalogDatabase = Effect.fn('CatalogDatabase.make')(function* makeDatabase(
  configuration: ContextServiceContract<typeof DatabaseConfig> & {
    readonly poolDeadlines?: Partial<DatabasePoolDeadlines>;
  },
  poolFactory: CatalogPoolFactory = defaultPoolFactory,
): Effect.fn.Return<ContextServiceContract<typeof CatalogDatabase>, CatalogDatabaseConnectionError, Scope.Scope> {
  const poolConfiguration = yield* configureDatabasePool(
    Redacted.make(configuration.connectionString),
    configuration.poolDeadlines,
  ).pipe(Effect.mapError((error) => new CatalogDatabaseConnectionError({ reason: error.reason })));
  const pool = yield* Effect.acquireRelease(
    Effect.try({ catch: connectionFailure, try: () => poolFactory(poolConfiguration) }),
    // oxlint-disable-next-line typescript/promise-function-async -- Effect.promise owns the foreign pg finalizer.
    (ownedPool) => Effect.promise(() => ownedPool.end()),
  );
  const reactivity = yield* Reactivity.make;
  const client = yield* PgClient.fromPool({ acquire: Effect.succeed(pool) }).pipe(
    Effect.provideService(Reactivity.Reactivity, reactivity),
    Effect.mapError(connectionFailure),
  );
  return {
    executor: yield* makeWithDefaults({ relations: catalogRelations }).pipe(
      Effect.provideService(PgClient.PgClient, client),
    ),
  };
});

export const CatalogDatabaseLive = Layer.effect(
  CatalogDatabase,
  Effect.gen(function* makeCatalogDatabaseService() {
    const configuration = yield* DatabaseConfig;
    return yield* makeCatalogDatabase(configuration);
  }),
);
