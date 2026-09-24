import type { WorkerDraft } from './worker-form.tsx';
import { Effect, Schema } from 'effect';
import { dependencyReadGateway } from '../../../api/dependency-read-gateway.ts';
import { workforceClientOptions } from './workforce-client-options.ts';
import { WorkerProfileSchema, WorkerIdSchema } from '../../../../shared/resources/worker.ts';
import type { Worker } from '../../../../shared/resources/worker.ts';
import { formInvalid } from './workforce-form-invalid.ts';
import { executeCreateWorker } from '../../../api/create-worker-action-client.ts';
import { CreateWorkerPayloadSchema } from '../../../../shared/actions/create-worker.ts';
import { executeUpdateWorker } from '../../../api/update-worker-action-client.ts';
import { executeChangeWorkerStatus } from '../../../api/change-worker-status-action-client.ts';
import { ChangeWorkerStatusPayloadSchema } from '../../../../shared/actions/change-worker-status.ts';
import { executeAddAbsence } from '../../../api/add-absence-action-client.ts';
import { AddAbsencePayloadSchema } from '../../../../shared/actions/add-absence.ts';
import { executeRemoveAbsence } from '../../../api/remove-absence-action-client.ts';
import { RemoveAbsencePayloadSchema } from '../../../../shared/actions/remove-absence.ts';
import { executeAssignWorker } from '../../../api/assign-worker-action-client.ts';
import { AssignWorkerPayloadSchema } from '../../../../shared/actions/assign-worker.ts';
import { executeUnassignWorker } from '../../../api/unassign-worker-action-client.ts';
import { UnassignWorkerPayloadSchema } from '../../../../shared/actions/unassign-worker.ts';

const profileInput = (input: WorkerDraft) => ({
  ...input,
  agreementValidTo: input.agreementValidTo || null,
  internalHourlyCostCzk: input.internalHourlyCostCzk || null,
  phone: input.phone || null,
  position: input.position || null,
});

const options = (key: string) => ({ ...workforceClientOptions(), idempotencyKey: key });
export const createWorkerCommand = (input: WorkerDraft, key: string) =>
  Schema.decodeUnknownEffect(CreateWorkerPayloadSchema)(profileInput(input)).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => executeCreateWorker(payload, key, options(key))),
  );
export const updateWorkerCommand = Effect.fn('Workforce.updateCommand')(function* updateCommand(
  input: WorkerDraft,
  worker: Worker,
  key: string,
) {
  const profile = yield* Schema.decodeUnknownEffect(WorkerProfileSchema)(profileInput(input)).pipe(
    Effect.mapError(formInvalid),
  );
  const id = yield* Schema.decodeEffect(WorkerIdSchema)(worker.ref.resourceId).pipe(Effect.mapError(formInvalid));
  return yield* executeUpdateWorker({ ...profile, expectedRevision: worker.revision, id }, key, options(key));
});
export const changeWorkerStatusCommand = (input: typeof ChangeWorkerStatusPayloadSchema.Encoded, key: string) =>
  Schema.decodeEffect(ChangeWorkerStatusPayloadSchema)(input).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => executeChangeWorkerStatus(payload, key, options(key))),
  );
export const addAbsenceCommand = (
  input: { readonly dateFrom: string; readonly dateTo: string; readonly reason: string; readonly workerId: string },
  key: string,
) =>
  Schema.decodeUnknownEffect(AddAbsencePayloadSchema)(input).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => executeAddAbsence(payload, key, options(key))),
  );
export const removeAbsenceCommand = (input: typeof RemoveAbsencePayloadSchema.Encoded, key: string) =>
  Schema.decodeEffect(RemoveAbsencePayloadSchema)(input).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => executeRemoveAbsence(payload, key, options(key))),
  );
export const assignWorkerCommand = (input: typeof AssignWorkerPayloadSchema.Encoded, key: string) =>
  Schema.decodeEffect(AssignWorkerPayloadSchema)(input).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => dependencyReadGateway.invoke(executeAssignWorker(payload, key, options(key)))),
  );
export const unassignWorkerCommand = (input: typeof UnassignWorkerPayloadSchema.Encoded, key: string) =>
  Schema.decodeEffect(UnassignWorkerPayloadSchema)(input).pipe(
    Effect.mapError(formInvalid),
    Effect.flatMap((payload) => dependencyReadGateway.invoke(executeUnassignWorker(payload, key, options(key)))),
  );
