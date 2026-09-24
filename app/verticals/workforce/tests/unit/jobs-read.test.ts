import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { DEPENDENCY_READ_AUTHORIZATION_HEADER } from '@app/shared-contracts/dependency-read-gateway';
import { ConfigProvider, DateTime, Effect, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { beforeEach, expect, it, rstest } from 'effect-rstest';
import { jobsReadService } from '../../src/services/jobs-read.service.ts';
import { weekInterval } from '../../src/services/workforce-read-model.ts';
import { jobFixture, principal } from '../fixtures.ts';

const mocks = rstest.hoisted(() => ({ detail: rstest.fn(), list: rstest.fn(), verify: rstest.fn() }));
rstest.mock('@app/service-jobs/api/client', () => ({
  executeJobDetailWithAuthorization: mocks.detail,
  executeJobListWithAuthorization: mocks.list,
}));
rstest.mock('@app/gateway-principal-verifier/dependency-read', () => ({
  bindDependencyReadVerifier: () => mocks.verify,
}));
const a = jobFixture('60000000-0000-4000-8000-000000000001');
const b = jobFixture('60000000-0000-4000-8000-000000000002');
const scope = {
  ...Schema.decodeSync(TrustedPrincipalContextSchema)(principal),
  correlationId: 'jobs-read-test',
};
const reader = jobsReadService(scope).pipe(
  Effect.provideService(GatewayPrincipalVerifierConfiguration, {
    configuration: Effect.die('Verifier supplied by adapter test'),
  }),
  Effect.provideService(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromUnknown({
      ONTOS_SERVICE_JOBS_API_URL: 'http://localhost:4109/service-jobs-api',
    }),
  ),
  Effect.provideService(
    HttpServerRequest.HttpServerRequest,
    HttpServerRequest.fromWeb(
      new Request('http://localhost/workforce-api', {
        headers: { [DEPENDENCY_READ_AUTHORIZATION_HEADER]: 'Bearer fixture.header.signature' },
      }),
    ),
  ),
);
beforeEach(() => {
  rstest.clearAllMocks();
  mocks.verify.mockReturnValue(Effect.void);
  mocks.detail.mockReturnValue(Effect.succeed(a));
  mocks.list.mockReturnValue(Effect.succeed({ items: [a, b] }));
});
it.effect('makes a single union provider request and refuses reuse of its credential', () =>
  Effect.gen(function* singleUse() {
    const service = yield* reader;
    const selection = { references: [a.ref, b.ref, a.ref] };
    expect(yield* service.read(selection)).toEqual([a, b]);
    expect(yield* service.read(selection).pipe(Effect.flip)).toMatchObject({ code: 'workforce_unavailable' });
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list.mock.calls[0]?.[0]).toEqual({ selection: { references: [a.ref, b.ref] } });
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  }),
);
it.effect('fails closed when a requested Job is missing', () =>
  Effect.gen(function* missingReference() {
    mocks.list.mockReturnValue(Effect.succeed({ items: [a] }));
    const service = yield* reader;
    expect(yield* service.read({ references: [a.ref, b.ref] }).pipe(Effect.flip)).toMatchObject({
      code: 'workforce_unavailable',
    });
  }),
);
for (const foreign of [
  { ...a, legalEntityId: b.ref.resourceId },
  { ...a, ref: { ...a.ref, tenantId: b.ref.resourceId } },
]) {
  it.effect('rejects provider records outside the current tenant or Legal Entity', () =>
    Effect.gen(function* wrongScope() {
      mocks.detail.mockReturnValue(Effect.succeed(foreign));
      const service = yield* reader;
      expect(yield* service.read({ references: [a.ref] }).pipe(Effect.flip)).toMatchObject({ code: 'scope_mismatch' });
      expect(mocks.detail).toHaveBeenCalledTimes(1);
    }),
  );
}
for (const [date, hours] of [
  ['2026-03-23', 167],
  ['2026-10-19', 169],
] as const) {
  it.effect(`keeps seven Prague calendar days across DST from ${date}`, () =>
    Effect.sync(() => {
      const interval = weekInterval(date);
      expect(interval).not.toBeNull();
      if (interval !== null) {
        expect((DateTime.toEpochMillis(interval.to) - DateTime.toEpochMillis(interval.from)) / 3_600_000).toBe(hours);
      }
    }),
  );
}
