import { DateTime, Effect, Schema } from 'effect';
import type { FetchHttpClient } from 'effect/unstable/http';
import { useEffect, useReducer, useRef } from 'react';
import type { ServiceJobRef } from '@app/service-jobs/resources/service-job';
import type { Worker } from '../../../../shared/resources/worker.ts';
import { WorkerDetailRequestSchema } from '../../../../shared/apis/worker-detail.ts';
import { WorkforceCommitStatusRequestSchema } from '../../../../shared/apis/workforce-commit-status.ts';
import type {
  WorkerDetailSchema,
  PlannedJobSchema,
  WorkerCandidateSchema,
} from '../../../../shared/workforce-views.ts';
import { executeWorkerList } from '../../../api/worker-list-client.ts';
import { executeWorkerDetail } from '../../../api/worker-detail-client.ts';
import { executeWeeklySchedule } from '../../../api/weekly-schedule-client.ts';
import { executeAvailableWorkers } from '../../../api/available-workers-client.ts';
import { executeWorkforceCommitStatus } from '../../../api/workforce-commit-status-client.ts';
import { dependencyReadGateway } from '../../../api/dependency-read-gateway.ts';
import { runWorkforceEffect } from '../../../runtime/workforce-runtime.ts';
import { pragueDay } from '../../../domain/availability.ts';
import { workforceClientOptions } from './workforce-client-options.ts';
import { mapWorkforceFailure, workforceCorrelation } from './workforce-effects.ts';
import type { ClientFailure, WorkforceUiFailure } from './workforce-effects.ts';
import type { WorkforceFormInvalid } from './workforce-form-invalid.ts';

type Mutation = Effect.Effect<Worker, ClientFailure | WorkforceFormInvalid, FetchHttpClient.RequestInit>;
interface Command {
  readonly effect: Mutation;
  readonly invocationId?: string;
  readonly showWorker: boolean;
}
interface State {
  candidates: readonly (typeof WorkerCandidateSchema.Type)[];
  command: Command | null;
  creating: boolean;
  detail: typeof WorkerDetailSchema.Type | null;
  failure: WorkforceUiFailure | null;
  jobRef: ServiceJobRef | null;
  jobs: readonly (typeof PlannedJobSchema.Type)[];
  loading: boolean;
  loadingCrew: boolean;
  loadingDetail: boolean;
  pending: boolean;
  refresh: number;
  selectedId: string | null;
  today: string;
  view: 'workers' | 'schedule';
  weekStart: string;
  workers: readonly Worker[];
}
const initial: State = {
  candidates: [],
  command: null,
  creating: false,
  detail: null,
  failure: null,
  jobRef: null,
  jobs: [],
  loading: true,
  loadingCrew: false,
  loadingDetail: false,
  pending: false,
  refresh: 0,
  selectedId: null,
  today: '',
  view: 'workers',
  weekStart: '',
  workers: [],
};
const reducer = (state: State, patch: Partial<State> | 'refresh'): State =>
  patch === 'refresh' ? { ...state, refresh: state.refresh + 1 } : { ...state, ...patch };
const monday = (now: DateTime.Utc) => {
  const day = pragueDay(DateTime.toEpochMillis(now));
  const date = DateTime.makeUnsafe(`${day}T00:00:00Z`);
  const offset = (DateTime.toDateUtc(date).getUTCDay() + 6) % 7;
  return DateTime.formatIsoDateUtc(DateTime.subtract(date, { days: offset }));
};
export const useWorkforceController = () => {
  const [state, dispatch] = useReducer(reducer, initial);
  const gate = useRef(false);
  const { command, jobRef, refresh, selectedId, view, weekStart } = state;
  useEffect(() => {
    const fiber = runWorkforceEffect(
      DateTime.now.pipe(
        Effect.tap((now) =>
          Effect.sync(() => dispatch({ today: pragueDay(DateTime.toEpochMillis(now)), weekStart: monday(now) })),
        ),
      ),
    );
    return () => fiber.interruptUnsafe();
  }, []);
  useEffect(() => {
    dispatch({ failure: null, loading: true });
    const work: Effect.Effect<Partial<State>, ClientFailure, FetchHttpClient.RequestInit> = view === 'workers'
      ? workforceCorrelation.pipe(
          Effect.flatMap((key) => executeWorkerList({}, `${key}:${refresh}`, workforceClientOptions())),
          Effect.map((result) => ({ workers: result.items })),
        )
      : workforceCorrelation.pipe(
          Effect.flatMap((key) =>
            dependencyReadGateway.invoke(
              executeWeeklySchedule({ weekStart }, `${key}:${refresh}`, workforceClientOptions()),
            ),
          ),
          Effect.map((result) => ({ jobs: result.items })),
        );
    const fiber = runWorkforceEffect(
      weekStart === ''
        ? Effect.void
        : work.pipe(
            Effect.match({
              onFailure: (error) =>
                dispatch({ failure: mapWorkforceFailure(error), jobs: [], loading: false, workers: [] }),
              onSuccess: (result) => dispatch({ ...result, loading: false }),
            }),
          ),
    );
    return () => fiber.interruptUnsafe();
  }, [view, weekStart, refresh]);
  useEffect(() => {
    dispatch({ detail: null, loadingDetail: selectedId !== null });

    const fiber = runWorkforceEffect(
      selectedId === null
        ? Effect.void
        : Schema.decodeEffect(WorkerDetailRequestSchema)({ id: selectedId ?? '' }).pipe(
            Effect.flatMap((input) =>
              workforceCorrelation.pipe(
                Effect.flatMap((key) =>
                  dependencyReadGateway.invoke(
                    executeWorkerDetail(input, `${key}:${refresh}`, workforceClientOptions()),
                  ),
                ),
              ),
            ),
            Effect.match({
              onFailure: (error) => dispatch({ failure: mapWorkforceFailure(error), loadingDetail: false }),
              onSuccess: (detail) => dispatch({ detail, loadingDetail: false }),
            }),
          ),
    );
    return () => fiber.interruptUnsafe();
  }, [selectedId, refresh]);
  useEffect(() => {
    dispatch({ candidates: [], loadingCrew: jobRef !== null });

    const fiber = runWorkforceEffect(
      jobRef === null
        ? Effect.void
        : workforceCorrelation.pipe(
            Effect.flatMap((key) =>
              dependencyReadGateway.invoke(
                executeAvailableWorkers({ jobRef }, `${key}:${refresh}`, workforceClientOptions()),
              ),
            ),
            Effect.match({
              onFailure: (error) => dispatch({ failure: mapWorkforceFailure(error), loadingCrew: false }),
              onSuccess: (result) => dispatch({ candidates: result.items, loadingCrew: false }),
            }),
          ),
    );
    return () => fiber.interruptUnsafe();
  }, [jobRef, refresh]);
  const settle = (value: Command, workerId?: string) => {
    gate.current = false;
    dispatch({
      command: null,
      creating: false,
      failure: null,
      pending: false,
      selectedId: value.showWorker && workerId !== undefined ? workerId : selectedId,
    });
    dispatch('refresh');
  };
  const runCommand = (value: Command) => {
    if (gate.current) {
      return;
    }
    gate.current = true;
    dispatch({ command: value, failure: null, pending: true });
    runWorkforceEffect(
      value.effect.pipe(
        Effect.match({
          onFailure: (error) => {
            gate.current = false;
            const failure = mapWorkforceFailure(error);
            dispatch({ failure, pending: false });
            if (failure.kind === 'committed') {
              settle(value, selectedId ?? failure.invocationId);
            } else if (failure.kind === 'uncertain') {
              dispatch({
                command: failure.invocationId === undefined ? value : { ...value, invocationId: failure.invocationId },
              });
            } else if (failure.kind !== 'unavailable') {
              dispatch({ command: null });
            }
          },
          onSuccess: (worker) => settle(value, worker.ref.resourceId),
        }),
      ),
    );
  };
  const submit = (make: (key: string) => Mutation, showWorker = false) => {
    if (gate.current || command !== null) {
      return;
    }
    gate.current = true;
    dispatch({ pending: true });
    runWorkforceEffect(
      workforceCorrelation.pipe(
        Effect.tap((key) =>
          Effect.sync(() => {
            gate.current = false;
            runCommand({ effect: make(key), showWorker });
          }),
        ),
      ),
    );
  };
  const recover = () => {
    if (gate.current || command?.invocationId === undefined) {
      return;
    }
    gate.current = true;
    dispatch({ pending: true });
    runWorkforceEffect(
      Schema.decodeEffect(WorkforceCommitStatusRequestSchema)({ invocationId: command.invocationId }).pipe(
        Effect.flatMap((input) =>
          workforceCorrelation.pipe(
            Effect.flatMap((key) => executeWorkforceCommitStatus(input, `${key}:${refresh}`, workforceClientOptions())),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            gate.current = false;
            dispatch({ failure: mapWorkforceFailure(error), pending: false });
          },
          onSuccess: (result) => {
            gate.current = false;
            dispatch({ pending: false });
            if (result.state === 'COMMITTED') {
              settle(command, selectedId ?? command.invocationId);
            } else if (result.state === 'OPEN' && result.retryCommand) {
              dispatch({
                command: { effect: command.effect, showWorker: command.showWorker },
                failure: { kind: 'unavailable' },
              });
            } else {
              dispatch({ failure: { kind: 'uncertain' } });
            }
          },
        }),
      ),
    );
  };
  return { dispatch, locked: state.pending || command !== null, recover, runCommand, state, submit };
};
