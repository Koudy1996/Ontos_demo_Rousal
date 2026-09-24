import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { Effect, Schema } from 'effect';
import type { FetchHttpClient } from 'effect/unstable/http';
import { useEffect, useReducer, useRef } from 'react';
import { BillingDocumentsCommitStatusRequestSchema } from '../../../../shared/apis/billing-documents-commit-status.ts';
import type { InvoiceDraftSupportResponse } from '../../../../shared/apis/invoice-draft-support.ts';
import type { InvoiceListItem } from '../../../../shared/apis/invoice-list.ts';
import type { Invoice, RecipientAddressSelection } from '../../../../shared/resources/invoice.ts';
import { executeBillingDocumentsCommitStatus } from '../../../api/billing-documents-commit-status-client.ts';
import { executeCreateInvoiceDraft } from '../../../api/create-invoice-draft-action-client.ts';
import { executeInvoiceDetail } from '../../../api/invoice-detail-client.ts';
import { executeInvoiceDraftSupport } from '../../../api/invoice-draft-support-client.ts';
import { executeInvoiceList } from '../../../api/invoice-list-client.ts';
import { executeInvoiceableJobs } from '../../../api/invoiceable-jobs-client.ts';
import { executeIssueInvoice } from '../../../api/issue-invoice-action-client.ts';
import { executeUpdateInvoiceDraft } from '../../../api/update-invoice-draft-action-client.ts';
import { runBillingDocumentsEffect } from '../../../runtime/billing-documents-runtime.ts';
import { billingDocumentsClientOptions } from './billing-documents-client-options.ts';
import type { BillingDocumentsUiFailure, ClientFailure } from './billing-documents-effects.ts';
import { billingDocumentsCorrelation, mapBillingDocumentsFailure } from './billing-documents-effects.ts';

type Mutation = Effect.Effect<Invoice, ClientFailure, FetchHttpClient.RequestInit>;
interface Command {
  readonly effect: Mutation;
  readonly invocationId?: string;
}
interface State {
  readonly command: Command | null;
  readonly error: BillingDocumentsUiFailure | null;
  readonly invoiceCursor: string | null;
  readonly invoices: readonly InvoiceListItem[];
  readonly jobCursor: string | null;
  readonly jobs: readonly ServiceJob[];
  readonly jobsRefresh: number;
  readonly loading: boolean;
  readonly loadingJobs: boolean;
  readonly pending: boolean;
  readonly refresh: number;
  readonly selected: Invoice | null;
  readonly support: InvoiceDraftSupportResponse | null;
  readonly view: 'create' | 'detail' | 'list';
}
const initial: State = {
  command: null,
  error: null,
  invoiceCursor: null,
  invoices: [],
  jobCursor: null,
  jobs: [],
  jobsRefresh: 0,
  loading: true,
  loadingJobs: false,
  pending: false,
  refresh: 0,
  selected: null,
  support: null,
  view: 'list',
};
const reducer = (state: State, patch: Partial<State>): State => ({ ...state, ...patch });

const runRead = <Success>(
  effect: Effect.Effect<Success, ClientFailure, FetchHttpClient.RequestInit>,
  onFailure: (failure: BillingDocumentsUiFailure) => void,
  onSuccess: (result: Success) => void,
) =>
  runBillingDocumentsEffect(
    effect.pipe(
      Effect.match({
        onFailure: (error) => onFailure(mapBillingDocumentsFailure(error)),
        onSuccess,
      }),
    ),
  );

export interface InvoiceDraftInput {
  readonly description: string;
  readonly paymentTermId: string;
  readonly selection: RecipientAddressSelection | null;
}

export const useInvoicesController = () => {
  const [state, dispatch] = useReducer(reducer, initial);
  const listGeneration = useRef(0);
  const jobsGeneration = useRef(0);
  const mutationGate = useRef(false);
  const paginationGate = useRef(false);
  const { command, jobsRefresh, refresh, view } = state;

  useEffect(() => {
    const current = listGeneration.current + 1;
    listGeneration.current = current;
    dispatch({ error: null, invoiceCursor: null, loading: true });
    const fiber = runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) => executeInvoiceList({ pageSize: 100 }, key, billingDocumentsClientOptions())),
        Effect.annotateLogs({ refresh }),
      ),
      (failure) => {
        if (current === listGeneration.current) {
          dispatch({ error: failure, loading: false });
        }
      },
      (page) => {
        if (current === listGeneration.current) {
          dispatch({ invoiceCursor: page.nextCursor, invoices: page.items, loading: false });
        }
      },
    );
    return () => {
      listGeneration.current += 1;
      fiber.interruptUnsafe();
    };
  }, [refresh]);

  useEffect(() => {
    if (view !== 'create') {
      return () => {
        jobsGeneration.current += 1;
      };
    }
    const current = jobsGeneration.current + 1;
    jobsGeneration.current = current;
    dispatch({ error: null, jobCursor: null, loadingJobs: true });
    const fiber = runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) => executeInvoiceableJobs({ pageSize: 100 }, key, billingDocumentsClientOptions())),
        Effect.annotateLogs({ jobsRefresh }),
      ),
      (failure) => {
        if (current === jobsGeneration.current) {
          dispatch({ error: failure, loadingJobs: false });
        }
      },
      (page) => {
        if (current === jobsGeneration.current) {
          dispatch({ jobCursor: page.nextCursor, jobs: page.items, loadingJobs: false });
        }
      },
    );
    return () => {
      jobsGeneration.current += 1;
      fiber.interruptUnsafe();
    };
  }, [jobsRefresh, view]);

  const loadSupport = (invoice: Invoice) => {
    dispatch({ error: null, loading: true, selected: invoice, support: null, view: 'detail' });
    runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) =>
          executeInvoiceDraftSupport({ invoiceRef: invoice.ref }, key, billingDocumentsClientOptions()),
        ),
      ),
      (failure) => dispatch({ error: failure, loading: false }),
      (support) => dispatch({ loading: false, selected: support.invoice, support }),
    );
  };
  const loadDetail = (invoice: Invoice) => {
    dispatch({ error: null, loading: true, selected: invoice, support: null, view: 'detail' });
    runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) =>
          executeInvoiceDetail({ invoiceRef: invoice.ref }, key, billingDocumentsClientOptions()),
        ),
      ),
      (failure) => dispatch({ error: failure, loading: false }),
      (fresh) => dispatch({ loading: false, selected: fresh, support: null }),
    );
  };
  const refreshDetail = (invoice: Invoice) => {
    if (invoice.status === 'DRAFT') {
      loadSupport(invoice);
    } else {
      loadDetail(invoice);
    }
  };
  const reloadCommittedSelection = (invoice: Invoice) => {
    dispatch({ command: null, error: null, loading: true, pending: false, refresh: state.refresh + 1 });
    runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) =>
          executeInvoiceDetail({ invoiceRef: invoice.ref }, key, billingDocumentsClientOptions()),
        ),
      ),
      (failure) => dispatch({ error: failure, loading: false }),
      (fresh) => {
        if (fresh.status === 'DRAFT') {
          loadSupport(fresh);
        } else {
          dispatch({ loading: false, selected: fresh, support: null, view: 'detail' });
        }
      },
    );
  };
  const settle = (invoice?: Invoice) => {
    mutationGate.current = false;
    dispatch({ command: null, error: null, pending: false, refresh: state.refresh + 1 });
    if (invoice !== undefined) {
      refreshDetail(invoice);
    }
  };
  const runCommand = (value: Command) => {
    if (mutationGate.current) {
      return;
    }
    mutationGate.current = true;
    dispatch({ command: value, error: null, pending: true });
    runBillingDocumentsEffect(
      value.effect.pipe(
        Effect.match({
          onFailure: (error) => {
            mutationGate.current = false;
            const failure = mapBillingDocumentsFailure(error);
            if (failure.kind === 'committed') {
              if (state.selected === null) {
                settle();
              } else {
                reloadCommittedSelection(state.selected);
              }
              return;
            }
            dispatch({ error: failure, pending: false });
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
          onSuccess: (invoice) => settle(invoice),
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
    runBillingDocumentsEffect(
      billingDocumentsCorrelation.pipe(
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
    const pendingCommand = command;
    if (mutationGate.current || pendingCommand?.invocationId === undefined) {
      return;
    }
    const { invocationId } = pendingCommand;
    mutationGate.current = true;
    dispatch({ pending: true });
    runBillingDocumentsEffect(
      Schema.decodeEffect(BillingDocumentsCommitStatusRequestSchema)({ invocationId }).pipe(
        Effect.flatMap((input) =>
          billingDocumentsCorrelation.pipe(
            Effect.flatMap((key) => executeBillingDocumentsCommitStatus(input, key, billingDocumentsClientOptions())),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            mutationGate.current = false;
            dispatch({ error: mapBillingDocumentsFailure(error), pending: false });
          },
          onSuccess: (result) => {
            mutationGate.current = false;
            dispatch({ pending: false });
            if (result.state === 'COMMITTED') {
              if (state.selected === null) {
                settle();
              } else {
                reloadCommittedSelection(state.selected);
              }
            } else if (result.state === 'OPEN' && result.retryCommand) {
              runCommand({ effect: pendingCommand.effect });
            } else {
              dispatch({ error: { invocationId, kind: 'uncertain' } });
            }
          },
        }),
      ),
    );
  };
  const open = (invoice: Invoice) => refreshDetail(invoice);
  const save = (draft: InvoiceDraftInput) => {
    const { selected: invoice, support } = state;
    if (invoice === null || support === null || invoice.status !== 'DRAFT') {
      return;
    }
    const paymentTermRef =
      support.paymentTerms.find((term) => term.paymentTermRef.resourceId === draft.paymentTermId)?.paymentTermRef ??
      null;
    submit((key) =>
      executeUpdateInvoiceDraft(
        {
          description: draft.description,
          expectedRevision: invoice.revision,
          invoiceRef: invoice.ref,
          paymentTermRef,
          recipientAddressSelection: draft.selection,
        },
        key,
        { ...billingDocumentsClientOptions(), idempotencyKey: key },
      ),
    );
  };
  const loadMoreInvoices = () => {
    const cursor = state.invoiceCursor;
    if (cursor === null || paginationGate.current) {
      return;
    }
    paginationGate.current = true;
    dispatch({ error: null });
    runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) => executeInvoiceList({ cursor, pageSize: 100 }, key, billingDocumentsClientOptions())),
      ),
      (failure) => {
        paginationGate.current = false;
        dispatch({ error: failure });
      },
      (page) => {
        paginationGate.current = false;
        dispatch({ invoiceCursor: page.nextCursor, invoices: [...state.invoices, ...page.items] });
      },
    );
  };
  const loadMoreJobs = () => {
    const cursor = state.jobCursor;
    if (cursor === null || paginationGate.current) {
      return;
    }
    paginationGate.current = true;
    dispatch({ error: null, loadingJobs: true });
    runRead(
      billingDocumentsCorrelation.pipe(
        Effect.flatMap((key) =>
          executeInvoiceableJobs({ cursor, pageSize: 100 }, key, billingDocumentsClientOptions()),
        ),
      ),
      (failure) => {
        paginationGate.current = false;
        dispatch({ error: failure, loadingJobs: false });
      },
      (page) => {
        paginationGate.current = false;
        dispatch({ jobCursor: page.nextCursor, jobs: [...state.jobs, ...page.items], loadingJobs: false });
      },
    );
  };

  const reload = () => {
    if (state.view === 'detail' && state.selected !== null) {
      refreshDetail(state.selected);
    } else if (state.view === 'create') {
      dispatch({ jobsRefresh: state.jobsRefresh + 1 });
    } else {
      dispatch({ refresh: state.refresh + 1 });
    }
  };

  return {
    back: () => dispatch({ error: null, selected: null, support: null, view: 'list' }),
    create: (job: ServiceJob) =>
      submit((key) =>
        executeCreateInvoiceDraft({ sourceJobRef: job.ref }, key, {
          ...billingDocumentsClientOptions(),
          idempotencyKey: key,
        }),
      ),
    issue: () => {
      const { selected: invoice } = state;
      if (invoice !== null && invoice.status === 'DRAFT') {
        submit((key) =>
          executeIssueInvoice({ expectedRevision: invoice.revision, invoiceRef: invoice.ref }, key, {
            ...billingDocumentsClientOptions(),
            idempotencyKey: key,
          }),
        );
      }
    },
    loadMoreInvoices,
    loadMoreJobs,
    newInvoice: () => dispatch({ error: null, view: 'create' }),
    open,
    recover,
    reload,
    retry: () => {
      if (command === null) {
        reload();
      } else {
        runCommand(command);
      }
    },
    save,
    state,
  };
};
