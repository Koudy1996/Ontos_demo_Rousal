import type { OperationalScope } from '@app/core-runtime';
import { bindDependencyReadVerifier } from '@app/gateway-principal-verifier/dependency-read';
import { executeJobDetailWithAuthorization, executeJobListWithAuthorization } from '@app/service-jobs/api/client';
import type { ServiceJob, ServiceJobRef } from '@app/service-jobs/resources/service-job';
import { JobIdSchema } from '@app/service-jobs/resources/service-job';
import {
  DEPENDENCY_READ_AUTHORIZATION_HEADER,
  withDependencyCredentialRedaction,
} from '@app/shared-contracts/dependency-read-gateway';
import { Config, Effect, Match, Option, Redacted, Ref, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { JobExpenseRejected, JobExpenseUnavailable } from '../../shared/resources/job-expense-failure.ts';

export interface JobsReader {
  readonly get: (ref: ServiceJobRef) => Effect.Effect<ServiceJob, JobExpenseRejected | JobExpenseUnavailable>;
  readonly list: (
    request: JobListRequest,
  ) => Effect.Effect<JobListResponse, JobExpenseRejected | JobExpenseUnavailable>;
}
export type JobListRequest = Parameters<typeof executeJobListWithAuthorization>[0];
type JobListResponse = Effect.Success<ReturnType<typeof executeJobListWithAuthorization>>;
const unavailable = (cause?: unknown) =>
  Object.defineProperty(
    new JobExpenseUnavailable({ code: 'job_expenses_unavailable', reason: 'Current Job data is unavailable' }),
    'cause',
    { enumerable: false, value: cause },
  );
const denied = () => new JobExpenseRejected({ code: 'scope_mismatch', reason: 'Job access is not permitted' });
const missing = () => new JobExpenseRejected({ code: 'job_not_found', reason: 'Job was not found' });
type ProviderFailure = Effect.Error<
  ReturnType<typeof executeJobDetailWithAuthorization> | ReturnType<typeof executeJobListWithAuthorization>
>;
const mapFailure = (error: ProviderFailure) =>
  Match.value(error).pipe(
    Match.tag('JobDetailForbiddenProblem', 'JobListForbiddenProblem', denied),
    Match.tag('JobDetailNotFoundProblem', 'JobListNotFoundProblem', missing),
    Match.tag(
      'JobDetailAuthenticationProblem',
      'JobListAuthenticationProblem',
      'JobDetailInvalidProblem',
      'JobListInvalidProblem',
      'JobDetailPolicyProblem',
      'JobListPolicyProblem',
      'JobDetailPolicyConflictProblem',
      'JobListPolicyConflictProblem',
      'JobDetailUnavailableProblem',
      'JobListUnavailableProblem',
      'JobDetailInternalProblem',
      'JobListInternalProblem',
      'HttpClientError',
      'SchemaError',
      unavailable,
    ),
    Match.exhaustive,
  );
const verify = bindDependencyReadVerifier('service-jobs');

export const jobsReadService = Effect.fn('JobExpenses.jobsReader')(function* jobsReader(scope: OperationalScope) {
  const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
  const configured = yield* Config.string('ONTOS_SERVICE_JOBS_API_URL').pipe(Effect.option);
  const consumed = yield* Ref.make(false);
  const verified = yield* Effect.gen(function* verifyDependency() {
    if (Option.isNone(request) || Option.isNone(configured)) {
      return yield* unavailable();
    }
    const destination = URL.parse(configured.value);
    if (
      destination === null ||
      !['http:', 'https:'].includes(destination.protocol) ||
      destination.username !== '' ||
      destination.password !== '' ||
      destination.search !== '' ||
      destination.hash !== '' ||
      destination.pathname !== '/service-jobs-api'
    ) {
      return yield* unavailable();
    }
    const header = request.value.headers[DEPENDENCY_READ_AUTHORIZATION_HEADER];
    if (header === undefined || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(header)) {
      return yield* unavailable();
    }
    yield* verify(Redacted.make(header), scope).pipe(Effect.mapError(unavailable));
    return { authorization: Redacted.make(header), baseUrl: configured.value };
  }).pipe(Effect.result);
  const credential = Effect.gen(function* consumeCredential() {
    if (yield* Ref.getAndSet(consumed, true)) {
      return yield* unavailable();
    }
    return yield* Effect.fromResult(verified);
  });
  const assertScope = (job: ServiceJob) =>
    job.ref.tenantId === scope.tenantId && job.legalEntityId === scope.legalEntityId
      ? Effect.succeed(job)
      : Effect.fail(denied());
  return {
    get: (ref: ServiceJobRef) =>
      Effect.gen(function* getJob() {
        if (ref.tenantId !== scope.tenantId) {
          return yield* denied();
        }
        const auth = yield* credential;
        const id = yield* Schema.decodeEffect(JobIdSchema)(ref.resourceId).pipe(Effect.mapError(unavailable));
        const job = yield* executeJobDetailWithAuthorization(
          { target: { id } },
          Redacted.value(auth.authorization),
          scope.correlationId,
          { baseUrl: auth.baseUrl },
        ).pipe(Effect.mapError(mapFailure));
        if (
          job.ref.resourceId !== ref.resourceId ||
          job.ref.resourceType !== ref.resourceType ||
          job.ref.moduleId !== ref.moduleId
        ) {
          return yield* denied();
        }
        return yield* assertScope(job);
      }).pipe(withDependencyCredentialRedaction),
    list: (input: JobListRequest) =>
      Effect.gen(function* listJobs() {
        const auth = yield* credential;
        const result = yield* executeJobListWithAuthorization(
          input,
          Redacted.value(auth.authorization),
          scope.correlationId,
          { baseUrl: auth.baseUrl },
        ).pipe(Effect.mapError(mapFailure));
        yield* Effect.forEach(result.items, assertScope, { concurrency: 1, discard: true });
        return result;
      }).pipe(withDependencyCredentialRedaction),
  } satisfies JobsReader;
});
