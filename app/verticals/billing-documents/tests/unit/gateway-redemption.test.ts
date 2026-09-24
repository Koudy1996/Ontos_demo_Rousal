import {
  GatewayAssertionRedemptionService,
  GatewayAssertionRedemptionUnavailableError,
  GatewayAssertionReplayError,
} from '@app/core-runtime';
import { GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS } from '@app/shared-contracts';
import { PgClient } from '@effect/sql-pg';
import { Context, DateTime, Effect, Layer, Schema, Stream } from 'effect';
import { expect, it } from 'effect-rstest';
import { TestClock } from 'effect/testing';
import { Reactivity } from 'effect/unstable/reactivity';
import type { Connection } from 'effect/unstable/sql/SqlConnection';
import { ConnectionError, SqlError } from 'effect/unstable/sql/SqlError';
import { GatewayAssertionRedemptionLive } from '../../src/auth/gateway-assertion-redemption-runtime.ts';

const testSqlConnection = (
  execute: (sql: string, params: readonly unknown[]) => Effect.Effect<readonly object[], SqlError>,
): Connection => {
  const values = (sql: string, params: readonly unknown[]) =>
    execute(sql, params).pipe(Effect.map((rows) => rows.map(Object.values)));
  return {
    execute,
    executeRaw: execute,
    executeStream: (sql, params) => Stream.fromIterableEffect(execute(sql, params)),
    executeUnprepared: execute,
    executeValues: values,
    executeValuesUnprepared: values,
  };
};

const assertion = {
  audience: 'billing-documents',
  expiresAtEpochSeconds: 1_700_000_300,
  issuer: 'https://shell.ontos.test',
  jti: '60000000-0000-4000-8000-000000000071',
};
const expiry = (assertion.expiresAtEpochSeconds + GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS) * 1000;
const fixture = (execute: (sql: string, params: readonly unknown[]) => Effect.Effect<readonly object[], SqlError>) =>
  Effect.gen(function* wireFixture() {
    const connection = testSqlConnection(execute);
    const reactivity = yield* Reactivity.make;
    const client = yield* PgClient.makeWith({
      acquirer: Effect.succeed(connection),
      config: {},
      listenAcquirer: Effect.die('Notifications unused'),
      transactionAcquirer: Effect.succeed(connection),
    }).pipe(Effect.provideService(Reactivity.Reactivity, reactivity));
    const services = yield* Layer.build(
      GatewayAssertionRedemptionLive.pipe(Layer.provide(Layer.succeed(PgClient.PgClient, client))),
    );
    return Context.get(services, GatewayAssertionRedemptionService);
  });

it.effect('atomically admits one assertion once and retains replay evidence', () =>
  Effect.gen(function* replay() {
    yield* TestClock.setTime(expiry - 1);
    let inserted = false;
    const statements: string[] = [];
    const service = yield* fixture((sql, params) => {
      statements.push(sql);
      if (sql.startsWith('delete')) {
        expect(params[0]).toEqual(
          DateTime.formatIso(DateTime.makeUnsafe((assertion.expiresAtEpochSeconds - 60) * 1000 - 1)),
        );
        return Effect.succeed([]);
      }
      const rows = inserted ? [] : [{ jti: assertion.jti }];
      inserted = true;
      return Effect.succeed(rows);
    });
    yield* service.consume(assertion);
    expect(Schema.is(GatewayAssertionReplayError)(yield* service.consume(assertion).pipe(Effect.flip))).toBe(true);
    expect(statements.some((sql) => sql === 'COMMIT' || sql === 'BEGIN')).toBe(false);
  }),
);

it.effect('keeps replay-store failures typed and does not admit the assertion', () =>
  Effect.gen(function* unavailable() {
    yield* TestClock.setTime(expiry - 1000);
    const service = yield* fixture(() =>
      Effect.fail(new SqlError({ reason: new ConnectionError({ cause: 'private connection details' }) })),
    );
    expect(
      Schema.is(GatewayAssertionRedemptionUnavailableError)(yield* service.consume(assertion).pipe(Effect.flip)),
    ).toBe(true);
  }),
);
