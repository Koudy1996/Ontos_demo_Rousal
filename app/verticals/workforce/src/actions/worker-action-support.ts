import type { ActionHandlerContext } from '@app/core-runtime';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { Effect, Option } from 'effect';
import type { Worker, WorkerProfileSchema } from '../../shared/resources/worker.ts';
import { WorkforceRejected } from '../../shared/resources/workforce-failure.ts';
import type { WorkforcePersistence } from '../services/workforce-persistence.service.ts';

export const validateProfile = (profile: typeof WorkerProfileSchema.Type) =>
  Option.isSome(profile.agreementValidTo) && profile.agreementValidTo.value < profile.agreementValidFrom
    ? Effect.fail(new WorkforceRejected({ code: 'invalid_worker', reason: 'Agreement end precedes its start' }))
    : Effect.void;
export const recordWorker = (
  context: ActionHandlerContext<Record<never, never>, WorkforcePersistence>,
  worker: Worker,
) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: `worker-invariant:${worker.ref.resourceId}`,
    resultCount: 1,
    servingModuleKey: 'workforce.planning',
    targetModuleKey: 'workforce.planning',
    targetResourceId: worker.ref.resourceId,
    targetResourceType: 'workforce.planning.worker',
  });
export const recordJobs = (
  context: ActionHandlerContext<Record<never, never>, WorkforcePersistence>,
  jobs: readonly ServiceJob[],
) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: 'current-assignment-jobs',
    resultCount: jobs.length,
    servingModuleKey: 'service.jobs',
  });
