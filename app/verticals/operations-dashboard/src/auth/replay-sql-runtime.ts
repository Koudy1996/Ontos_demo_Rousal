import { DatabaseConfig, configureDatabasePool } from '@app/core-runtime';
import { PgClient } from '@effect/sql-pg';
import { Effect, Redacted } from 'effect';
import { Pool } from 'pg';

export const replaySqlLive = PgClient.layerFrom(
  Effect.gen(function* replaySqlClient() {
    const configuration = yield* DatabaseConfig;
    const poolConfiguration = yield* configureDatabasePool(Redacted.make(configuration.connectionString));
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new Pool(poolConfiguration)),
      (value) =>
        Effect.callback((resume) => {
          value.end(() => resume(Effect.void));
        }),
    );
    return yield* PgClient.fromPool({ acquire: Effect.succeed(pool) });
  }),
);
