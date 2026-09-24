import { GatewayAssertionRedemptionService, GatewayAssertionReplayError } from '@app/core-runtime';
import { GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS } from '@app/shared-contracts';
import { PgClient } from '@effect/sql-pg';
import { Context, DateTime, Effect, Layer, Schema, Stream } from 'effect';
import { expect, it } from 'effect-rstest';
import { TestClock } from 'effect/testing';
import { Reactivity } from 'effect/unstable/reactivity';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { Connection } from 'effect/unstable/sql/SqlConnection';
import { DashboardOverviewResponseSchema } from '../../shared/apis/dashboard-overview.ts';
import { GatewayAssertionRedemptionLive } from '../../src/auth/gateway-assertion-redemption-runtime.ts';
import { pragueWeekStart } from '../../src/services/dashboard-overview.service.ts';

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

const redemptionFixture = (
  execute: (sql: string, params: readonly unknown[]) => Effect.Effect<readonly object[], SqlError>,
) =>
  Effect.gen(function* wireRedemptionFixture() {
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

it('calculates Monday in Europe/Prague across daylight-saving boundaries', () => {
  expect(pragueWeekStart(DateTime.makeUnsafe('2026-03-29T22:30:00.000Z'))).toBe('2026-03-30');
  expect(pragueWeekStart(DateTime.makeUnsafe('2026-10-25T23:30:00.000Z'))).toBe('2026-10-26');
});

it('keeps null economics distinct from a zero result', () => {
  const result = Schema.decodeSync(DashboardOverviewResponseSchema)({
    draftInvoices: { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' },
    generatedAt: '2026-09-25T08:00:00.000Z',
    inquiries: { count: { exact: true, value: 0 }, state: 'READY' },
    invoiceable: {
      count: { exact: true, value: 1 },
      hasMore: false,
      items: [
        {
          economics: {
            agreedPriceCzk: '0.00',
            comparisonReason: 'ZERO_AGREED_PRICE',
            currency: 'CZK',
            differenceCzk: null,
            marginPercent: null,
            recordedCostTotal: '0.00',
            state: 'READY',
          },
          job: {
            addressLine: 'Dlouhá 12',
            city: 'Praha',
            description: 'Vyklizení bytu',
            id: 'job-1',
            scheduledStartAt: null,
            status: 'COMPLETED',
          },
        },
      ],
      state: 'READY',
    },
    issuedInvoices: { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' },
    jobsInProgress: { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' },
    jobsToday: { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' },
    jobsUpcoming: { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' },
    weeklySchedule: { items: [], state: 'READY', weekStart: '2026-09-21' },
  });
  if (result.invoiceable.state === 'READY') {
    const economics = result.invoiceable.items[0]?.economics;
    expect(economics?.state).toBe('READY');
    if (economics?.state === 'READY') {
      expect(economics.differenceCzk).toBeNull();
      expect(economics.marginPercent).toBeNull();
    }
  }
});

it.effect('redeems one shell assertion atomically in durable storage', () =>
  Effect.gen(function* oneUseAssertion() {
    const expiresAtEpochSeconds = 1_800_000_000;
    yield* TestClock.setTime((expiresAtEpochSeconds + GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS) * 1000 - 1);
    let inserted = false;
    const assertion = {
      audience: 'operations-dashboard',
      expiresAtEpochSeconds,
      issuer: 'https://shell.ontos.test',
      jti: '73000000-0000-4000-8000-000000000010',
    };
    const redemption = yield* redemptionFixture((sql) => {
      if (sql.startsWith('delete')) {
        return Effect.succeed([]);
      }
      const rows = inserted ? [] : [{ jti: assertion.jti }];
      inserted = true;
      return Effect.succeed(rows);
    });
    yield* redemption.consume(assertion);
    expect(Schema.is(GatewayAssertionReplayError)(yield* redemption.consume(assertion).pipe(Effect.flip))).toBe(true);
  }),
);
