import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { DEPENDENCY_READ_AUTHORIZATION_HEADER } from '@app/shared-contracts/dependency-read-gateway';
import { ConfigProvider, Effect, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { beforeEach, expect, it, rstest } from 'effect-rstest';
import { jobsReadService } from '../../src/services/jobs-read.service.ts';
import { jobFixture, principal } from '../fixtures.ts';

const mocks = rstest.hoisted(() => ({ detail: rstest.fn(), list: rstest.fn(), verify: rstest.fn() }));
rstest.mock('@app/service-jobs/api/client', () => ({
  executeJobDetailWithAuthorization: mocks.detail,
  executeJobListWithAuthorization: mocks.list,
}));
rstest.mock('@app/gateway-principal-verifier/dependency-read', () => ({
  bindDependencyReadVerifier: () => mocks.verify,
}));

const job = jobFixture();
const foreign = jobFixture('60000000-0000-4000-8000-000000000002');
const foreignScope = Schema.decodeSync(TrustedPrincipalContextSchema)({
  ...principal,
  legalEntityId: '40000000-0000-4000-8000-000000000002',
  tenantId: '30000000-0000-4000-8000-000000000002',
});
const foreignRef = Schema.decodeSync(ServiceJobRefSchema)({ ...job.ref, tenantId: foreignScope.tenantId });
const scope = {
  ...Schema.decodeSync(TrustedPrincipalContextSchema)(principal),
  correlationId: 'job-expenses-jobs-read-test',
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
      new Request('http://localhost/job-expenses-api', {
        headers: { [DEPENDENCY_READ_AUTHORIZATION_HEADER]: 'Bearer fixture.header.signature' },
      }),
    ),
  ),
);

beforeEach(() => {
  rstest.clearAllMocks();
  mocks.verify.mockReturnValue(Effect.void);
  mocks.detail.mockReturnValue(Effect.succeed(job));
  mocks.list.mockReturnValue(Effect.succeed({ items: [job], nextCursor: null }));
});

it.effect('redeems one dependency credential and rejects replay', () =>
  Effect.gen(function* singleUse() {
    const service = yield* reader;
    expect(yield* service.get(job.ref)).toEqual(job);
    expect(yield* service.get(job.ref).pipe(Effect.flip)).toMatchObject({ code: 'job_expenses_unavailable' });
    expect(mocks.detail).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  }),
);

for (const response of [
  { ...job, legalEntityId: foreignScope.legalEntityId },
  { ...job, ref: { ...job.ref, tenantId: foreignScope.tenantId } },
  { ...job, ref: { ...job.ref, resourceId: foreign.ref.resourceId } },
]) {
  it.effect('rejects forged provider identity or scope before returning Job facts', () =>
    Effect.gen(function* wrongScope() {
      mocks.detail.mockReturnValue(Effect.succeed(response));
      const service = yield* reader;
      expect(yield* service.get(job.ref).pipe(Effect.flip)).toMatchObject({ code: 'scope_mismatch' });
    }),
  );
}

for (const [tag, code] of [
  ['JobDetailForbiddenProblem', 'scope_mismatch'],
  ['JobDetailNotFoundProblem', 'job_not_found'],
] as const) {
  it.effect(`maps ${tag} without returning empty or unavailable success`, () =>
    Effect.gen(function* providerFailure() {
      mocks.detail.mockReturnValue(Effect.fail({ _tag: tag }));
      const service = yield* reader;
      expect(yield* service.get(job.ref).pipe(Effect.flip)).toMatchObject({ code });
    }),
  );
}

it.effect('rejects a foreign requested ref before calling the provider', () =>
  Effect.gen(function* foreignRequest() {
    const service = yield* reader;
    expect(yield* service.get(foreignRef).pipe(Effect.flip)).toMatchObject({
      code: 'scope_mismatch',
    });
    expect(mocks.detail).not.toHaveBeenCalled();
  }),
);
