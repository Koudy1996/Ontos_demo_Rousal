import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { DateTime, Effect, Schema } from 'effect';
import type { FetchHttpClient } from 'effect/unstable/http';
import { useEffect, useReducer, useRef } from 'react';
import type { JobEconomicsResponseSchema } from '../../../../shared/apis/job-economics.ts';
import { JobExpensesCommitStatusRequestSchema } from '../../../../shared/apis/job-expenses-commit-status.ts';
import type { JobExpense } from '../../../../shared/resources/job-expense.ts';
import { executeJobEconomics } from '../../../api/job-economics-client.ts';
import { executeJobExpenseList } from '../../../api/job-expense-list-client.ts';
import { executeJobExpensesCommitStatus } from '../../../api/job-expenses-commit-status-client.ts';
import { executeJobSelection } from '../../../api/job-selection-client.ts';
import { dependencyReadGateway } from '../../../api/dependency-read-gateway.ts';
import { runJobExpensesEffect } from '../../../runtime/job-expenses-runtime.ts';
import type { ExpenseDraft } from './job-expense-commands.ts';
import { recordExpenseCommand, updateExpenseCommand, voidExpenseCommand } from './job-expense-commands.ts';
import { jobExpensesClientOptions } from './job-expenses-client-options.ts';
import type { ClientFailure, JobExpensesUiFailure } from './job-expenses-effects.ts';
import { jobExpensesCorrelation, mapJobExpensesFailure } from './job-expenses-effects.ts';
import type { JobExpensesFormInvalid } from './job-expenses-form-invalid.ts';

type Mutation = Effect.Effect<JobExpense, ClientFailure | JobExpensesFormInvalid, FetchHttpClient.RequestInit>;
interface Command {
  readonly effect: Mutation;
  readonly invocationId?: string;
}
interface State {
  readonly command: Command | null;
  readonly costs: readonly JobExpense[];
  readonly costsCursor: string | null;
  readonly economics: typeof JobEconomicsResponseSchema.Type | null;
  readonly economicsFailure: JobExpensesUiFailure | null;
  readonly editing: JobExpense | 'new' | null;
  readonly jobs: readonly ServiceJob[];
  readonly jobsCursor: string | null;
  readonly jobsRefresh: number;
  readonly listFailure: JobExpensesUiFailure | null;
  readonly loadingCosts: boolean;
  readonly loadingEconomics: boolean;
  readonly loadingJobs: boolean;
  readonly mutationFailure: JobExpensesUiFailure | null;
  readonly pending: boolean;
  readonly refresh: number;
  readonly selectedJob: ServiceJob | null;
  readonly selectionFailure: JobExpensesUiFailure | null;
  readonly today: string;
  readonly voiding: JobExpense | null;
}

const initial: State = {
  command: null,
  costs: [],
  costsCursor: null,
  economics: null,
  economicsFailure: null,
  editing: null,
  jobs: [],
  jobsCursor: null,
  jobsRefresh: 0,
  listFailure: null,
  loadingCosts: false,
  loadingEconomics: false,
  loadingJobs: true,
  mutationFailure: null,
  pending: false,
  refresh: 0,
  selectedJob: null,
  selectionFailure: null,
  today: '',
  voiding: null,
};
const reducer = (state: State, patch: Partial<State> | 'refresh'): State =>
  patch === 'refresh' ? { ...state, refresh: state.refresh + 1 } : { ...state, ...patch };
const pragueDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Prague',
  year: 'numeric',
});

const runRead = <A>(
  effect: Effect.Effect<A, ClientFailure, FetchHttpClient.RequestInit>,
  onFailure: (failure: JobExpensesUiFailure) => void,
  onSuccess: (result: A) => void,
) =>
  runJobExpensesEffect(
    effect.pipe(
      Effect.match({
        onFailure: (error) => onFailure(mapJobExpensesFailure(error)),
        onSuccess,
      }),
    ),
  );

export const useJobExpensesController = () => {
  const [state, dispatch] = useReducer(reducer, initial);
  const mutationGate = useRef(false);
  const jobsGate = useRef(false);
  const costsGate = useRef(false);
  const jobsGeneration = useRef(0);
  const costsGeneration = useRef(0);
  const { command, jobsRefresh, refresh, selectedJob } = state;

  useEffect(() => {
    const fiber = runJobExpensesEffect(
      DateTime.now.pipe(
        Effect.tap((now) =>
          Effect.sync(() =>
            dispatch({
              today: pragueDateFormatter.format(DateTime.toDateUtc(now)),
            }),
          ),
        ),
      ),
    );
    return () => fiber.interruptUnsafe();
  }, []);

  useEffect(() => {
    const generation = jobsGeneration.current + 1;
    jobsGeneration.current = generation;
    jobsGate.current = true;
    dispatch({ loadingJobs: true, selectionFailure: null });
    const fiber = runRead(
      jobExpensesCorrelation.pipe(
        Effect.annotateLogs({ jobsRefresh }),
        Effect.flatMap((key) =>
          dependencyReadGateway.invoke(executeJobSelection({ pageSize: 50 }, key, jobExpensesClientOptions())),
        ),
      ),
      (failure) => {
        if (generation !== jobsGeneration.current) {
          return;
        }
        jobsGate.current = false;
        dispatch({ loadingJobs: false, selectionFailure: failure });
      },
      (result) => {
        if (generation !== jobsGeneration.current) {
          return;
        }
        jobsGate.current = false;
        dispatch({ jobs: result.items, jobsCursor: result.nextCursor, loadingJobs: false });
      },
    );
    return () => fiber.interruptUnsafe();
  }, [jobsRefresh]);

  useEffect(() => {
    const generation = costsGeneration.current + 1;
    costsGeneration.current = generation;
    if (selectedJob === null) {
      return () => {
        costsGate.current = false;
      };
    }
    const jobRef = selectedJob.ref;
    costsGate.current = true;
    dispatch({
      costs: [],
      costsCursor: null,
      economics: null,
      economicsFailure: null,
      listFailure: null,
      loadingCosts: true,
      loadingEconomics: true,
    });
    const listFiber = runRead(
      jobExpensesCorrelation.pipe(
        Effect.annotateLogs({ refresh }),
        Effect.flatMap((key) =>
          executeJobExpenseList(
            { includeVoided: true, pageSize: 50, serviceJobRef: jobRef },
            key,
            jobExpensesClientOptions(),
          ),
        ),
      ),
      (failure) => {
        if (generation !== costsGeneration.current) {
          return;
        }
        costsGate.current = false;
        dispatch({ listFailure: failure, loadingCosts: false });
      },
      (result) => {
        if (generation !== costsGeneration.current) {
          return;
        }
        costsGate.current = false;
        dispatch({ costs: result.items, costsCursor: result.nextCursor, loadingCosts: false });
      },
    );
    const economicsFiber = runRead(
      jobExpensesCorrelation.pipe(
        Effect.annotateLogs({ refresh }),
        Effect.flatMap((key) =>
          dependencyReadGateway.invoke(executeJobEconomics({ serviceJobRef: jobRef }, key, jobExpensesClientOptions())),
        ),
      ),
      (failure) => {
        if (generation === costsGeneration.current) {
          dispatch({ economicsFailure: failure, loadingEconomics: false });
        }
      },
      (economics) => {
        if (generation === costsGeneration.current) {
          dispatch({ economics, loadingEconomics: false });
        }
      },
    );
    return () => {
      listFiber.interruptUnsafe();
      economicsFiber.interruptUnsafe();
    };
  }, [selectedJob, refresh]);

  const loadMoreJobs = () => {
    if (jobsGate.current || state.jobsCursor === null) {
      return;
    }
    const cursor = state.jobsCursor;
    const generation = jobsGeneration.current;
    jobsGate.current = true;
    dispatch({ loadingJobs: true, selectionFailure: null });
    runRead(
      jobExpensesCorrelation.pipe(
        Effect.flatMap((key) =>
          dependencyReadGateway.invoke(executeJobSelection({ cursor, pageSize: 50 }, key, jobExpensesClientOptions())),
        ),
      ),
      (failure) => {
        if (generation !== jobsGeneration.current) {
          return;
        }
        jobsGate.current = false;
        dispatch({ loadingJobs: false, selectionFailure: failure });
      },
      (result) => {
        if (generation !== jobsGeneration.current) {
          return;
        }
        jobsGate.current = false;
        dispatch({ jobs: [...state.jobs, ...result.items], jobsCursor: result.nextCursor, loadingJobs: false });
      },
    );
  };

  const loadMoreCosts = () => {
    if (costsGate.current || state.costsCursor === null || selectedJob === null) {
      return;
    }
    const cursor = state.costsCursor;
    const generation = costsGeneration.current;
    costsGate.current = true;
    dispatch({ listFailure: null, loadingCosts: true });
    runRead(
      jobExpensesCorrelation.pipe(
        Effect.flatMap((key) =>
          executeJobExpenseList(
            {
              cursor,
              includeVoided: true,
              pageSize: 50,
              serviceJobRef: selectedJob.ref,
            },
            key,
            jobExpensesClientOptions(),
          ),
        ),
      ),
      (failure) => {
        if (generation !== costsGeneration.current) {
          return;
        }
        costsGate.current = false;
        dispatch({ listFailure: failure, loadingCosts: false });
      },
      (result) => {
        if (generation !== costsGeneration.current) {
          return;
        }
        costsGate.current = false;
        dispatch({ costs: [...state.costs, ...result.items], costsCursor: result.nextCursor, loadingCosts: false });
      },
    );
  };

  const settle = () => {
    mutationGate.current = false;
    dispatch({ command: null, editing: null, mutationFailure: null, pending: false, voiding: null });
    dispatch('refresh');
  };
  const runCommand = (value: Command) => {
    if (mutationGate.current) {
      return;
    }
    mutationGate.current = true;
    dispatch({ command: value, mutationFailure: null, pending: true });
    runJobExpensesEffect(
      value.effect.pipe(
        Effect.match({
          onFailure: (error) => {
            mutationGate.current = false;
            const failure = mapJobExpensesFailure(error);
            if (failure.kind === 'committed') {
              settle();
              return;
            }
            if (failure.kind === 'conflict') {
              dispatch({
                command: null,
                editing: null,
                mutationFailure: failure,
                pending: false,
                voiding: null,
              });
              return;
            }
            dispatch({ mutationFailure: failure, pending: false });
            if (failure.kind === 'uncertain') {
              dispatch({
                command:
                  failure.invocationId === undefined
                    ? value
                    : { effect: value.effect, invocationId: failure.invocationId },
              });
            } else if (failure.kind !== 'unavailable') {
              dispatch({ command: null });
            }
          },
          onSuccess: settle,
        }),
      ),
    );
  };
  const submit = (make: (key: string) => Mutation) => {
    if (mutationGate.current || command !== null) {
      return;
    }
    mutationGate.current = true;
    dispatch({ pending: true });
    runJobExpensesEffect(
      jobExpensesCorrelation.pipe(
        Effect.tap((key) =>
          Effect.sync(() => {
            mutationGate.current = false;
            runCommand({ effect: make(key) });
          }),
        ),
      ),
    );
  };
  const recover = () => {
    if (mutationGate.current || command?.invocationId === undefined) {
      return;
    }
    mutationGate.current = true;
    dispatch({ pending: true });
    runJobExpensesEffect(
      Schema.decodeEffect(JobExpensesCommitStatusRequestSchema)({ invocationId: command.invocationId }).pipe(
        Effect.flatMap((input) =>
          jobExpensesCorrelation.pipe(
            Effect.flatMap((key) => executeJobExpensesCommitStatus(input, key, jobExpensesClientOptions())),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            mutationGate.current = false;
            dispatch({ mutationFailure: mapJobExpensesFailure(error), pending: false });
          },
          onSuccess: (result) => {
            mutationGate.current = false;
            dispatch({ pending: false });
            if (result.state === 'COMMITTED') {
              settle();
            } else if (result.state === 'OPEN' && result.retryCommand) {
              runCommand({ effect: command.effect });
            } else {
              dispatch({ mutationFailure: { kind: 'uncertain' } });
            }
          },
        }),
      ),
    );
  };

  return {
    dispatch,
    loadMoreCosts,
    loadMoreJobs,
    locked: state.pending || state.command !== null,
    record: (draft: ExpenseDraft) => {
      if (selectedJob !== null) {
        submit((key) => recordExpenseCommand(draft, selectedJob.ref, key));
      }
    },
    recover,
    refresh: () => dispatch('refresh'),
    reloadAfterConflict: () => {
      dispatch({ editing: null, mutationFailure: null, voiding: null });
      dispatch('refresh');
    },
    reloadJobs: () => dispatch({ jobsRefresh: state.jobsRefresh + 1 }),
    retryCommand: () => {
      if (state.command !== null) {
        runCommand(state.command);
      }
    },
    state,
    update: (draft: ExpenseDraft, expense: JobExpense) => submit((key) => updateExpenseCommand(draft, expense, key)),
    voidExpense: (expense: JobExpense, reason: string) => submit((key) => voidExpenseCommand(expense, reason, key)),
  };
};
