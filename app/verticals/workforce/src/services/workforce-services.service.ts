import type { ReadServiceFactory } from '@app/core-runtime';
import { Effect } from 'effect';
import type { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { workforcePersistenceService } from './workforce-persistence.service.ts';
import type { WorkforcePersistence } from './workforce-persistence.service.ts';
import { jobsReadService } from './jobs-read.service.ts';
import type { JobsReader } from './jobs-read.service.ts';

export type WorkforceServices = WorkforcePersistence & { readonly jobs: JobsReader };
export const workforceServices: ReadServiceFactory<WorkforceServices, GatewayPrincipalVerifierConfiguration> = (
  transaction,
  scope,
) =>
  Effect.all(
    { jobs: jobsReadService(scope), store: workforcePersistenceService(transaction, scope) },
    { concurrency: 1 },
  ).pipe(Effect.map(({ jobs, store }) => ({ ...store, jobs })));
