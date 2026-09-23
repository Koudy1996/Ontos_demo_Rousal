import type { ScheduleDraft, ExecutionDraft } from './job-commands.ts';
import { JobDetailRequestSchema } from '../../../../shared/apis/job-detail.ts';
import { PartyDisplayRequestSchema } from '../../../../shared/apis/party-display.ts';
import { jobClientOptions } from './job-client-options.ts';
import type { JobFormInvalid } from './job-form-invalid.ts';
import type { SalesInquiryRef } from '@app/sales-inquiries/resources/sales-inquiry';
import { createCommand, scheduleCommand, startCommand, completeCommand, executionCommand } from './job-commands.ts';
import { runJobEffect } from '../../../runtime/jobs-runtime.ts';
import type { FetchHttpClient } from 'effect/unstable/http';
import { Effect, Schema } from 'effect';
import { useEffect, useRef, useReducer } from 'react';
import { useSearch } from '@modern-js/plugin-tanstack/runtime';
import { ServiceJobSchema } from '../../../../shared/resources/service-job.ts';
import type { AcceptedSource, ServiceJob as DomainServiceJob } from '../../../../shared/resources/service-job.ts';
import { executeJobList } from '../../../api/job-list-client.ts';
import { executeJobDetail } from '../../../api/job-detail-client.ts';
import { executeAcceptedSourceSelection } from '../../../api/accepted-source-selection-client.ts';
import { executePartyDisplay } from '../../../api/party-display-client.ts';
import { executeJobCommitStatus } from '../../../api/job-commit-status-client.ts';
import type { executeCreateServiceJob } from '../../../api/create-service-job-action-client.ts';
import type { executeScheduleServiceJob } from '../../../api/schedule-service-job-action-client.ts';
import type { executeUpdateExecution } from '../../../api/update-execution-action-client.ts';
import type { executeCompleteServiceJob } from '../../../api/complete-service-job-action-client.ts';
import type { executeStartServiceJob } from '../../../api/start-service-job-action-client.ts';
import { jobCorrelation, mapJobFailure, withPartyRead, withSalesRead } from './jobs-effects.ts';
import type { JobUiFailure } from './jobs-effects.ts';

import type { JobListRequest } from '../../../../shared/apis/job-list.ts';

type ServiceJob = typeof ServiceJobSchema.Encoded;
const encodeJob = Schema.encodeEffect(ServiceJobSchema);
type Mutation = Effect.Effect<
  DomainServiceJob,
  | JobFormInvalid
  | Effect.Error<
      | ReturnType<typeof executeCreateServiceJob>
      | ReturnType<typeof executeScheduleServiceJob>
      | ReturnType<typeof executeUpdateExecution>
      | ReturnType<typeof executeCompleteServiceJob>
      | ReturnType<typeof executeStartServiceJob>
    >,
  FetchHttpClient.RequestInit
>;
interface PendingCommand {
  readonly effect: Mutation;
  readonly invocationId?: string;
  readonly sourceRef?: SalesInquiryRef;
}
interface JobPageState {
  command: PendingCommand | null;
  creating: boolean;
  failure: JobUiFailure | null;
  loading: boolean;
  names: ReadonlyMap<string, string>;
  pending: boolean;
  query: JobListRequest;
  rows: readonly ServiceJob[];
  searching: boolean;
  selected: ServiceJob | null;
  sources: readonly AcceptedSource[];
}
const initialPageState: JobPageState = {
  command: null,
  creating: false,
  failure: null,
  loading: true,
  names: new Map(),
  pending: false,
  query: { view: 'ALL' },
  rows: [],
  searching: false,
  selected: null,
  sources: [],
};
const reducePageState = (state: JobPageState, change: Partial<JobPageState> | 'refresh'): JobPageState =>
  change === 'refresh'
    ? { ...state, query: { ...state.query } }
    : { ...state, ...change, names: new Map([...state.names, ...(change.names ?? [])]) };

const loadJobPage = (query: JobListRequest) =>
  jobCorrelation.pipe(
    Effect.flatMap((correlation) =>
      executeJobList(query, correlation, jobClientOptions()).pipe(
        Effect.flatMap(({ items }) => Effect.forEach(items, (item) => encodeJob(item), { concurrency: 1 })),
        Effect.map((items) => ({ items })),
      ),
    ),
    Effect.flatMap(({ items }) =>
      Effect.forEach(
        items,
        (item) =>
          jobCorrelation.pipe(
            Effect.flatMap((correlation) =>
              withPartyRead(executePartyDisplay({ partyRef: item.partyRef }, correlation, jobClientOptions())),
            ),
            Effect.map((contact) => [item.partyRef.resourceId, contact.title] as const),
          ),
        { concurrency: 3 },
      ).pipe(Effect.map((entries) => ({ entries, items }))),
    ),
  );

export const useJobsController = () => {
  const { source: sourceId } = useSearch({ from: '/$lang/jobs' });
  const [state, dispatch] = useReducer(reducePageState, initialPageState);
  const { command, pending, query, selected } = state;
  const mutationLock = useRef(false);
  const selectedParty = selected?.partyRef;

  useEffect(() => {
    const fiber = runJobEffect(
      selectedParty === undefined
        ? Effect.void
        : Schema.decodeEffect(PartyDisplayRequestSchema)({ partyRef: selectedParty }).pipe(
            Effect.flatMap((input) =>
              jobCorrelation.pipe(
                Effect.flatMap((correlation) =>
                  withPartyRead(executePartyDisplay(input, correlation, jobClientOptions())),
                ),
              ),
            ),
            Effect.match({
              onFailure: (error) => dispatch({ failure: mapJobFailure(error) }),
              onSuccess: (contact) => dispatch({ names: new Map([[selectedParty.resourceId, contact.title]]) }),
            }),
          ),
    );
    return () => fiber.interruptUnsafe();
  }, [selectedParty]);

  useEffect(() => {
    if (sourceId !== undefined) {
      dispatch({ creating: true, searching: true });
    }
    const fiber = runJobEffect(
      sourceId === undefined
        ? Effect.void
        : jobCorrelation.pipe(
            Effect.flatMap((correlation) =>
              withSalesRead(executeAcceptedSourceSelection({ source: sourceId }, correlation, jobClientOptions())),
            ),
            Effect.match({
              onFailure: (error) => dispatch({ failure: mapJobFailure(error), searching: false }),
              onSuccess: (result) =>
                dispatch({
                  searching: false,
                  sources: result.items,
                }),
            }),
          ),
    );
    return () => fiber.interruptUnsafe();
  }, [sourceId]);

  useEffect(() => {
    const fiber = runJobEffect(
      loadJobPage(query).pipe(
        Effect.match({
          onFailure: (error) => {
            dispatch({ failure: mapJobFailure(error) });
            dispatch({ loading: false });
          },
          onSuccess: ({ entries, items }) => {
            dispatch({ rows: items });
            dispatch({ names: new Map(entries) });
            dispatch({ loading: false });
          },
        }),
      ),
    );
    return () => fiber.interruptUnsafe();
  }, [query]);

  const open = (id: string, sourceRef?: SalesInquiryRef) => {
    dispatch({ loading: true });
    dispatch({ failure: null });
    runJobEffect(
      Schema.decodeEffect(JobDetailRequestSchema)({ target: sourceRef === undefined ? { id } : { sourceRef } }).pipe(
        Effect.flatMap((input) =>
          jobCorrelation.pipe(
            Effect.flatMap((correlation) =>
              executeJobDetail(input, correlation, jobClientOptions()).pipe(Effect.flatMap(encodeJob)),
            ),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            dispatch({ failure: mapJobFailure(error) });
            dispatch({ loading: false });
          },
          onSuccess: (job) => {
            dispatch({ selected: job });
            dispatch({ creating: false });
            dispatch({ loading: false });
          },
        }),
      ),
    );
  };
  const complete = (job: ServiceJob) => {
    dispatch({ command: null });
    mutationLock.current = false;
    dispatch({ pending: false });
    dispatch({ failure: null });
    dispatch({ selected: job });
    dispatch({ creating: false });
    dispatch('refresh');
  };
  const runCommand = (value: PendingCommand) => {
    if (mutationLock.current) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    dispatch({ failure: null });
    dispatch({ command: value });
    runJobEffect(
      value.effect.pipe(
        Effect.flatMap(encodeJob),
        Effect.match({
          onFailure: (error) => {
            const mapped = mapJobFailure(error);
            dispatch({ failure: mapped });
            dispatch({ pending: false });
            mutationLock.current = false;
            if (mapped.kind === 'uncertain') {
              dispatch({
                command: mapped.invocationId === undefined ? value : { ...value, invocationId: mapped.invocationId },
              });
            } else if (mapped.kind === 'committed') {
              dispatch({ command: null });
              dispatch('refresh');
              open(selected?.ref.resourceId ?? mapped.invocationId ?? '', value.sourceRef);
            } else if (mapped.kind !== 'unavailable') {
              dispatch({ command: null });
            }
          },
          onSuccess: complete,
        }),
      ),
    );
  };
  const submit = (make: (key: string) => Mutation, sourceRef?: SalesInquiryRef) => {
    if (mutationLock.current || command !== null) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    runJobEffect(
      jobCorrelation.pipe(
        Effect.tap((key) =>
          Effect.sync(() => {
            mutationLock.current = false;
            runCommand(sourceRef === undefined ? { effect: make(key) } : { effect: make(key), sourceRef });
          }),
        ),
      ),
    );
  };
  const recover = () => {
    const invocationId = command?.invocationId;
    if (invocationId === undefined || mutationLock.current) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    runJobEffect(
      Schema.decodeEffect(Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ActionInvocationId')))(
        invocationId,
      ).pipe(
        Effect.flatMap((id) =>
          jobCorrelation.pipe(
            Effect.flatMap((correlation) =>
              executeJobCommitStatus({ invocationId: id }, correlation, jobClientOptions()),
            ),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            mutationLock.current = false;
            dispatch({ pending: false });
            dispatch({ failure: mapJobFailure(error) });
          },
          onSuccess: (result) => {
            mutationLock.current = false;
            dispatch({ pending: false });
            if (result.state === 'COMMITTED') {
              dispatch({ command: null });
              dispatch({ failure: null });
              dispatch('refresh');
              open(selected?.ref.resourceId ?? invocationId, command?.sourceRef);
            } else if (result.state === 'OPEN' && result.retryCommand && command !== null) {
              dispatch({
                command:
                  command.sourceRef === undefined
                    ? { effect: command.effect }
                    : { effect: command.effect, sourceRef: command.sourceRef },
                failure: { kind: 'unavailable' },
              });
            } else {
              dispatch({ failure: { invocationId, kind: 'uncertain' } });
            }
          },
        }),
      ),
    );
  };
  const search = () => {
    dispatch({ searching: true });
    dispatch({ failure: null });
    runJobEffect(
      jobCorrelation.pipe(
        Effect.flatMap((correlation) =>
          withSalesRead(executeAcceptedSourceSelection({}, correlation, jobClientOptions())),
        ),
        Effect.match({
          onFailure: (error) => {
            dispatch({ searching: false });
            dispatch({ failure: mapJobFailure(error) });
          },
          onSuccess: (items) => {
            dispatch({ sources: items.items });
            dispatch({ searching: false });
          },
        }),
      ),
    );
  };
  const create = (source: AcceptedSource) => submit((key) => createCommand(source.sourceRef, key), source.sourceRef);
  const schedule = (data: ScheduleDraft) => {
    if (selected !== null) {
      submit((key) => scheduleCommand(selected, data, key));
    }
  };
  const start = () => {
    if (selected !== null) {
      submit((key) => startCommand(selected, key));
    }
  };
  const finish = () => {
    if (selected !== null) {
      submit((key) => completeCommand(selected, key));
    }
  };
  const execution = (data: ExecutionDraft) => {
    if (selected !== null) {
      submit((key) => executionCommand(selected, data, key));
    }
  };
  const refresh = () => {
    dispatch('refresh');
    if (selected !== null) {
      open(selected.ref.resourceId);
    }
  };
  const locked = pending || command !== null;

  return {
    create,
    dispatch,
    execution,
    finish,
    locked,
    open,
    recover,
    refresh,
    runCommand,
    schedule,
    search,
    start,
    state,
  };
};
