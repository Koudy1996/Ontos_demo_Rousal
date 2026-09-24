import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, rstest } from 'effect-rstest';
import { Effect, Schema } from 'effect';
import { InvoicesPage } from '../../src/routes/[lang]/invoices/page.tsx';
import {
  InvoiceListAuthenticationProblemSchema,
  InvoiceListForbiddenProblemSchema,
  InvoiceListUnavailableProblemSchema,
} from '../../shared/apis/invoice-list.ts';
import { CreateInvoiceDraftActionCommitIndeterminateProblemSchema } from '../../shared/apis/create-invoice-draft-action.ts';
import {
  IssueInvoiceActionAlreadyCommittedProblemSchema,
  IssueInvoiceActionCommitIndeterminateProblemSchema,
} from '../../shared/apis/issue-invoice-action.ts';
import { draftSupportFixture, invoiceFixture, jobFixture } from '../fixtures.ts';

const mocks = rstest.hoisted(() => ({
  executeBillingDocumentsCommitStatus: rstest.fn(),
  executeCreateInvoiceDraft: rstest.fn(),
  executeInvoiceableJobs: rstest.fn(),
  executeInvoiceDetail: rstest.fn(),
  executeInvoiceDraftSupport: rstest.fn(),
  executeInvoiceList: rstest.fn(),
  executeIssueInvoice: rstest.fn(),
  executeUpdateInvoiceDraft: rstest.fn(),
}));

rstest.mock('../../src/api/billing-documents-commit-status-client.ts', () => ({
  executeBillingDocumentsCommitStatus: mocks.executeBillingDocumentsCommitStatus,
}));
rstest.mock('../../src/api/create-invoice-draft-action-client.ts', () => ({
  executeCreateInvoiceDraft: mocks.executeCreateInvoiceDraft,
}));
rstest.mock('../../src/api/invoice-detail-client.ts', () => ({ executeInvoiceDetail: mocks.executeInvoiceDetail }));
rstest.mock('../../src/api/invoice-draft-support-client.ts', () => ({
  executeInvoiceDraftSupport: mocks.executeInvoiceDraftSupport,
}));
rstest.mock('../../src/api/invoice-list-client.ts', () => ({ executeInvoiceList: mocks.executeInvoiceList }));
rstest.mock('../../src/api/invoiceable-jobs-client.ts', () => ({
  executeInvoiceableJobs: mocks.executeInvoiceableJobs,
}));
rstest.mock('../../src/api/issue-invoice-action-client.ts', () => ({ executeIssueInvoice: mocks.executeIssueInvoice }));
rstest.mock('../../src/api/update-invoice-draft-action-client.ts', () => ({
  executeUpdateInvoiceDraft: mocks.executeUpdateInvoiceDraft,
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  useModernI18n: () => ({ language: 'cs', t: (key: string) => key.replace('billing-documents.demo.', '') }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));

const draft = invoiceFixture();
const issued = invoiceFixture('ISSUED');
const support = draftSupportFixture();
const job = jobFixture();
const listItem = (invoice: typeof draft) => ({
  customerDisplayName: invoice.recipientSnapshot?.displayName ?? 'Novák s.r.o.',
  invoice,
  sourceJobDisplayName: invoice.description,
});
const required = <Value,>(value: Value | undefined): Value => {
  if (value === undefined) {
    throw new Error('Expected test fixture value');
  }
  return value;
};
const isInputElement = Schema.is(Schema.instanceOf(HTMLInputElement));
const paymentTerm = required(support.paymentTerms[0]);

beforeEach(() => {
  mocks.executeInvoiceList.mockReturnValue(
    Effect.succeed({ items: [listItem(draft), listItem(issued)], nextCursor: null }),
  );
  mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [job], nextCursor: null }));
  mocks.executeInvoiceDraftSupport.mockReturnValue(Effect.succeed(support));
  mocks.executeInvoiceDetail.mockReturnValue(Effect.succeed(issued));
  mocks.executeCreateInvoiceDraft.mockReturnValue(Effect.succeed(draft));
  mocks.executeUpdateInvoiceDraft.mockReturnValue(Effect.succeed({ ...draft, revision: 2 }));
  mocks.executeIssueInvoice.mockReturnValue(Effect.succeed(issued));
  mocks.executeBillingDocumentsCommitStatus.mockReturnValue(
    Effect.succeed({ retryCommand: false, state: 'COMMITTED' }),
  );
});

afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});

it.live('renders searchable mobile-friendly invoice cards and an immutable issued snapshot', () =>
  Effect.gen(function* browseInvoices() {
    const print = rstest.fn();
    rstest.stubGlobal('print', print);
    render(<InvoicesPage />);
    yield* Effect.promise(() => screen.findByText('2026-000001'));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('main').className).toContain('min-w-0');
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'nenalezeno' } });
    expect(screen.getByText('empty')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('search'), { target: { value: '2026-000001' } });
    fireEvent.click(required(screen.getAllByRole('button', { name: 'open' })[0]));
    expect(yield* Effect.promise(() => screen.findByText('Novák s.r.o.'))).toBeTruthy();
    expect(screen.getByText('ICO: 12345678')).toBeTruthy();
    expect(screen.getByText('CZ_DIC: CZ12345678')).toBeTruthy();
    expect(screen.getByText(/Masarykova 10, Ostrava, 70200, CZ/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'print' }));
    expect(print).toHaveBeenCalledTimes(1);
  }),
);

it.live('renders honest loading and empty states', () =>
  Effect.gen(function* loadingAndEmpty() {
    mocks.executeInvoiceList.mockReturnValue(Effect.never);
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.never);
    const first = render(<InvoicesPage />);
    expect(yield* Effect.promise(() => screen.findByText('loading'))).toBeTruthy();
    expect(screen.queryByText('empty')).toBeNull();
    first.unmount();

    mocks.executeInvoiceList.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
    render(<InvoicesPage />);
    expect(yield* Effect.promise(() => screen.findByText('empty'))).toBeTruthy();
  }),
);

it.live(
  'creates a draft from a completed Job without browser-supplied commercial authority and disables double click',
  () =>
    Effect.gen(function* createDraft() {
      mocks.executeCreateInvoiceDraft.mockReturnValue(Effect.never);
      render(<InvoicesPage />);
      fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'new' })));
      expect(yield* Effect.promise(() => screen.findByText(job.serviceScope.description))).toBeTruthy();
      const button = screen.getByRole('button', { name: 'createDraft' });
      fireEvent.click(button);
      yield* Effect.promise(() => waitFor(() => expect(mocks.executeCreateInvoiceDraft).toHaveBeenCalledTimes(1)));
      expect(mocks.executeCreateInvoiceDraft.mock.calls[0]?.[0]).toEqual({ sourceJobRef: job.ref });
      expect(mocks.executeCreateInvoiceDraft.mock.calls[0]?.[0]).not.toHaveProperty('amount');
      expect(button).toHaveProperty('disabled', true);
      expect(screen.getByText('saving')).toBeTruthy();
    }),
);

it.live('preselects exactly one preferred BILLING address and updates only allowed draft fields', () =>
  Effect.gen(function* editDraft() {
    render(<InvoicesPage />);
    fireEvent.click(required((yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' })))[0]));
    expect(yield* Effect.promise(() => screen.findByText('Novák s.r.o.'))).toBeTruthy();
    const preferred = screen.getByRole('radio', { name: /Masarykova 10/u });
    expect(preferred).toHaveProperty('checked', true);
    fireEvent.change(screen.getByLabelText('description'), { target: { value: 'Vyklizení podle dokončené zakázky' } });
    fireEvent.change(screen.getByLabelText('paymentTerm'), {
      target: { value: paymentTerm.paymentTermRef.resourceId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeUpdateInvoiceDraft).toHaveBeenCalledTimes(1)));
    expect(mocks.executeUpdateInvoiceDraft.mock.calls[0]?.[0]).toMatchObject({
      description: 'Vyklizení podle dokončené zakázky',
      expectedRevision: 1,
      invoiceRef: draft.ref,
      paymentTermRef: paymentTerm.paymentTermRef,
      recipientAddressSelection: draft.recipientAddressSelection,
    });
    expect(mocks.executeUpdateInvoiceDraft.mock.calls[0]?.[0]).not.toHaveProperty('commercialSnapshot');
  }),
);

it.live('does not silently choose among addresses and allows a one-time billing address', () =>
  Effect.gen(function* chooseAddress() {
    const noSelection = { ...draft, recipientAddressSelection: null };
    mocks.executeInvoiceList.mockReturnValue(Effect.succeed({ items: [listItem(noSelection)], nextCursor: null }));
    mocks.executeInvoiceDraftSupport.mockReturnValue(
      Effect.succeed({
        ...support,
        billingAddresses: [
          { ...required(support.billingAddresses[0]), preferred: false },
          {
            ...required(support.billingAddresses[0]),
            address: { ...required(support.billingAddresses[0]).address, addressLine1: 'Nádražní 2' },
            contactPointRef: {
              ...required(support.billingAddresses[0]).contactPointRef,
              resourceId: '83000000-0000-4000-8000-000000000002',
            },
            preferred: false,
          },
        ],
        invoice: noSelection,
      }),
    );
    render(<InvoicesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    const choices = yield* Effect.promise(() => screen.findAllByRole('radio'));
    expect(choices.every((choice) => isInputElement(choice) && !choice.checked)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'oneTimeAddress' }));
    fireEvent.change(screen.getByLabelText('street'), { target: { value: 'Jiná 5' } });
    fireEvent.change(screen.getByLabelText('city'), { target: { value: 'Brno' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeUpdateInvoiceDraft).toHaveBeenCalledTimes(1)));
    expect(mocks.executeUpdateInvoiceDraft.mock.calls[0]?.[0]).toMatchObject({
      recipientAddressSelection: { address: { addressLine1: 'Jiná 5', city: 'Brno' }, kind: 'ONE_TIME' },
    });
  }),
);

it.live('requires a usable one-time address and a saved draft before Issue', () =>
  Effect.gen(function* requireSavedDraft() {
    render(<InvoicesPage />);
    fireEvent.click(required((yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' })))[0]));
    const issue = yield* Effect.promise(() => screen.findByRole('button', { name: 'issue' }));
    expect(issue).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText('description'), { target: { value: 'Neuložená změna' } });
    expect(issue).toHaveProperty('disabled', true);
    expect(screen.getByText('unsaved')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'oneTimeAddress' }));
    const save = screen.getByRole('button', { name: 'save' });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('street'), { target: { value: 'Jiná 5' } });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('city'), { target: { value: 'Brno' } });
    expect(save).toHaveProperty('disabled', false);
  }),
);

it.live('keeps the invoice list available without loading Service Jobs and retries a failed list read', () =>
  Effect.gen(function* independentInvoiceList() {
    mocks.executeInvoiceList
      .mockReturnValueOnce(
        Effect.fail(
          InvoiceListUnavailableProblemSchema.make({
            detail: 'Failure',
            retryable: true,
            status: 503,
            title: 'Failure',
            type: 'https://ontos.dev/test',
          }),
        ),
      )
      .mockReturnValue(Effect.succeed({ items: [listItem(issued)], nextCursor: null }));
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.never);

    render(<InvoicesPage />);
    expect(yield* Effect.promise(() => screen.findByText('error.unavailable'))).toBeTruthy();
    expect(mocks.executeInvoiceableJobs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(yield* Effect.promise(() => screen.findByText('2026-000001'))).toBeTruthy();
    expect(mocks.executeInvoiceableJobs).not.toHaveBeenCalled();
  }),
);

it.live('restores a saved one-time address when reopening a draft', () =>
  Effect.gen(function* restoreOneTimeAddress() {
    const oneTimeInvoice = {
      ...draft,
      recipientAddressSelection: {
        address: {
          addressLine1: 'Jiná 5',
          addressLine2: null,
          city: 'Brno',
          countryCode: 'CZ',
          postalCode: null,
          region: null,
        },
        kind: 'ONE_TIME' as const,
      },
    };
    mocks.executeInvoiceList.mockReturnValue(Effect.succeed({ items: [listItem(oneTimeInvoice)], nextCursor: null }));
    mocks.executeInvoiceDraftSupport.mockReturnValue(Effect.succeed({ ...support, invoice: oneTimeInvoice }));

    render(<InvoicesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    expect(yield* Effect.promise(() => screen.findByRole('radio', { name: 'oneTimeAddress' }))).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByLabelText('street')).toHaveProperty('value', 'Jiná 5');
    expect(screen.getByLabelText('city')).toHaveProperty('value', 'Brno');
  }),
);

it.live('recovers an indeterminate commit by invocation id', () =>
  Effect.gen(function* recoverCommit() {
    mocks.executeCreateInvoiceDraft.mockReturnValue(
      Effect.fail(
        CreateInvoiceDraftActionCommitIndeterminateProblemSchema.make({
          detail: 'Výsledek commitu není známý',
          invocationId: '85000000-0000-4000-8000-000000000001',
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Unknown',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<InvoicesPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'new' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'createDraft' })));
    expect(yield* Effect.promise(() => screen.findByText('error.uncertain'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'resolve' }));
    yield* Effect.promise(() =>
      waitFor(() => expect(mocks.executeBillingDocumentsCommitStatus).toHaveBeenCalledTimes(1)),
    );
    expect(mocks.executeBillingDocumentsCommitStatus.mock.calls[0]?.[0]).toEqual({
      invocationId: '85000000-0000-4000-8000-000000000001',
    });
  }),
);

it.live('keeps recovery available while commit status remains indeterminate, then reloads issued detail', () =>
  Effect.gen(function* recoverRepeatedly() {
    mocks.executeIssueInvoice.mockReturnValue(
      Effect.fail(
        IssueInvoiceActionCommitIndeterminateProblemSchema.make({
          detail: 'Výsledek commitu není známý',
          invocationId: '85000000-0000-4000-8000-000000000002',
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Unknown',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    mocks.executeBillingDocumentsCommitStatus
      .mockReturnValueOnce(Effect.succeed({ retryCommand: false, state: 'INDETERMINATE' }))
      .mockReturnValueOnce(Effect.succeed({ retryCommand: false, state: 'COMMITTED' }));
    render(<InvoicesPage />);
    fireEvent.click(required((yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' })))[0]));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'issue' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'resolve' })));
    yield* Effect.promise(() =>
      waitFor(() => expect(mocks.executeBillingDocumentsCommitStatus).toHaveBeenCalledTimes(1)),
    );
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'resolve' })));
    expect(yield* Effect.promise(() => screen.findByTestId('issued-invoice'))).toHaveProperty(
      'textContent',
      expect.stringContaining('2026-000001'),
    );
    expect(mocks.executeBillingDocumentsCommitStatus).toHaveBeenCalledTimes(2);
    expect(mocks.executeInvoiceDetail).toHaveBeenCalledTimes(1);
    expect(mocks.executeInvoiceDraftSupport).toHaveBeenCalledTimes(1);
  }),
);

it.live('reloads the selected invoice after an already-committed Issue response', () =>
  Effect.gen(function* recoverAlreadyCommitted() {
    mocks.executeIssueInvoice.mockReturnValue(
      Effect.fail(
        IssueInvoiceActionAlreadyCommittedProblemSchema.make({
          code: 'action_already_committed',
          detail: 'Action already committed',
          invocationId: '85000000-0000-4000-8000-000000000003',
          resolution: 'REFRESH_GOVERNED_READS',
          retryCommand: false,
          status: 409,
          title: 'Committed',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<InvoicesPage />);
    fireEvent.click(required((yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' })))[0]));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'issue' })));
    expect(yield* Effect.promise(() => screen.findByTestId('issued-invoice'))).toHaveProperty(
      'textContent',
      expect.stringContaining('2026-000001'),
    );
    expect(mocks.executeInvoiceDetail).toHaveBeenCalledTimes(1);
    expect(mocks.executeInvoiceDraftSupport).toHaveBeenCalledTimes(1);
  }),
);

for (const [failure, kind] of [
  [
    InvoiceListAuthenticationProblemSchema.make({
      detail: 'Failure',
      status: 401,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'authentication',
  ],
  [
    InvoiceListForbiddenProblemSchema.make({
      detail: 'Failure',
      status: 403,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'forbidden',
  ],
  [
    InvoiceListUnavailableProblemSchema.make({
      detail: 'Failure',
      retryable: true,
      status: 503,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'unavailable',
  ],
] as const) {
  it.live(`maps ${kind} list failures without a false empty result`, () =>
    Effect.gen(function* listFailure() {
      mocks.executeInvoiceList.mockReturnValue(Effect.fail(failure));
      render(<InvoicesPage />);
      expect(yield* Effect.promise(() => screen.findByText(`error.${kind}`))).toBeTruthy();
      expect(screen.queryByText('empty')).toBeNull();
    }),
  );
}
