import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, rstest } from 'effect-rstest';
import { Deferred, Effect, Schema } from 'effect';
import { ExpensesPage } from '../../src/routes/[lang]/expenses/page.tsx';
import { expenseFixture, jobFixture } from '../fixtures.ts';
import {
  JobSelectionAuthenticationProblemSchema,
  JobSelectionForbiddenProblemSchema,
  JobSelectionUnavailableProblemSchema,
} from '../../shared/apis/job-selection.ts';
import { JobEconomicsUnavailableProblemSchema } from '../../shared/apis/job-economics.ts';
import {
  RecordJobExpenseActionCommitIndeterminateProblemSchema,
  RecordJobExpenseActionUnavailableProblemSchema,
} from '../../shared/apis/record-job-expense-action.ts';
import { UpdateJobExpenseActionConflictProblemSchema } from '../../shared/apis/update-job-expense-action.ts';

const mocks = rstest.hoisted(() => ({
  executeJobEconomics: rstest.fn(),
  executeJobExpenseList: rstest.fn(),
  executeJobExpensesCommitStatus: rstest.fn(),
  executeJobSelection: rstest.fn(),
  executeRecordJobExpense: rstest.fn(),
  executeUpdateJobExpense: rstest.fn(),
  executeVoidJobExpense: rstest.fn(),
}));
rstest.mock('../../src/api/job-economics-client.ts', () => ({ executeJobEconomics: mocks.executeJobEconomics }));
rstest.mock('../../src/api/job-expense-list-client.ts', () => ({ executeJobExpenseList: mocks.executeJobExpenseList }));
rstest.mock('../../src/api/job-expenses-commit-status-client.ts', () => ({
  executeJobExpensesCommitStatus: mocks.executeJobExpensesCommitStatus,
}));
rstest.mock('../../src/api/job-selection-client.ts', () => ({ executeJobSelection: mocks.executeJobSelection }));
rstest.mock('../../src/api/record-job-expense-action-client.ts', () => ({
  executeRecordJobExpense: mocks.executeRecordJobExpense,
}));
rstest.mock('../../src/api/update-job-expense-action-client.ts', () => ({
  executeUpdateJobExpense: mocks.executeUpdateJobExpense,
}));
rstest.mock('../../src/api/void-job-expense-action-client.ts', () => ({
  executeVoidJobExpense: mocks.executeVoidJobExpense,
}));
rstest.mock('../../src/api/dependency-read-gateway.ts', () => ({
  dependencyReadGateway: { invoke: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect },
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  useModernI18n: () => ({
    language: 'cs',
    t: (key: string) => {
      if (key === 'job-expenses.demo.money.currency') {
        return 'Kč';
      }
      if (key === 'job-expenses.demo.money.decimalSeparator') {
        return ',';
      }
      return key.replace('job-expenses.demo.', '');
    },
  }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));

const job = jobFixture();
const expense = expenseFixture();
const voided = expenseFixture('70000000-0000-4000-8000-000000000002', 'VOIDED');
const economics = {
  activeCount: 1,
  agreedPriceCzk: '20000.00',
  categoryTotals: { DISPOSAL: '0.00', MATERIAL: '0.00', OTHER: '0.00', TRANSPORT: '0.00', WORK: '4500.00' },
  comparisonReason: null,
  currency: 'CZK' as const,
  differenceCzk: '15500.00',
  jobStatus: 'NEW' as const,
  marginPercent: '77.50',
  priceBasis: 'EXCLUDING_VAT' as const,
  recordedCostTotal: '4500.00',
  serviceJobRef: job.ref,
  voidedCount: 1,
};

beforeEach(() => {
  rstest.stubGlobal('ULTRAMODERN_JOB_EXPENSES_API_BASE_URL', '/job-expenses-api');
  mocks.executeJobSelection.mockReturnValue(Effect.succeed({ items: [job], nextCursor: null }));
  mocks.executeJobExpenseList.mockReturnValue(Effect.succeed({ items: [expense, voided], nextCursor: null }));
  mocks.executeJobEconomics.mockReturnValue(Effect.succeed(economics));
  mocks.executeRecordJobExpense.mockReturnValue(Effect.succeed(expense));
  mocks.executeUpdateJobExpense.mockReturnValue(Effect.succeed({ ...expense, revision: 2 }));
  mocks.executeVoidJobExpense.mockReturnValue(Effect.succeed(voided));
  mocks.executeJobExpensesCommitStatus.mockReturnValue(Effect.succeed({ retryCommand: false, state: 'COMMITTED' }));
});
afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});
const formOf = (field: HTMLElement) =>
  Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(field.closest('form'));
const openJob = Effect.fn(function* openJob() {
  fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'jobs.open' })));
  yield* Effect.promise(() => screen.findByText('list.title'));
});

it.live('searches semantic job cards and renders exact economics plus active and voided expenses', () =>
  Effect.gen(function* browse() {
    render(<ExpensesPage />);
    yield* Effect.promise(() => screen.findByText(job.serviceScope.description));
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('jobs.search'), { target: { value: 'nenalezeno' } });
    expect(screen.getByText('jobs.noResults')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('jobs.search'), { target: { value: 'Dlouhá' } });
    yield* openJob();
    yield* Effect.promise(() => screen.findByText('summary.title'));
    expect(screen.getByText(/20.*000,00 Kč/u)).toBeTruthy();
    expect(screen.getAllByText(/4.*500,00 Kč/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/15.*500,00 Kč/u)).toBeTruthy();
    expect(screen.getByText(/77\.50.*%/u)).toBeTruthy();
    expect(screen.getAllByText('status.VOIDED')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'list.edit' })).toHaveLength(1);
  }),
);

it.live('keeps the local expense list visible when current Job economics is unavailable', () =>
  Effect.gen(function* isolatedList() {
    mocks.executeJobEconomics.mockReturnValue(
      Effect.fail(
        JobEconomicsUnavailableProblemSchema.make({
          detail: 'Jobs offline',
          retryable: true,
          status: 503,
          title: 'Offline',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<ExpensesPage />);
    yield* openJob();
    yield* Effect.promise(() => screen.findByText('error.unavailable'));
    expect(screen.getAllByText(expense.description).length).toBeGreaterThan(0);
    expect(screen.queryByText('list.empty')).toBeNull();
  }),
);

it.live('records through an accessible mobile form and disables a pending mutation', () =>
  Effect.gen(function* mutate() {
    render(<ExpensesPage />);
    yield* openJob();
    mocks.executeRecordJobExpense.mockReturnValue(Effect.never);
    fireEvent.click(screen.getByRole('button', { name: 'list.add' }));
    fireEvent.change(yield* Effect.promise(() => screen.findByLabelText('form.description')), {
      target: { value: 'Doprava na sběrný dvůr' },
    });
    fireEvent.change(screen.getByLabelText(/^form\.amount/u), { target: { value: '2 000,00'.replace(' ', '') } });
    const date = screen.getByLabelText(/^form\.incurredOn/u);
    fireEvent.change(date, { target: { value: '2026-09-24' } });
    fireEvent.submit(yield* formOf(date));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeRecordJobExpense).toHaveBeenCalledTimes(1)));
    expect(screen.getByText('saving')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'form.save' })).toHaveProperty('disabled', true);
    expect(mocks.executeRecordJobExpense.mock.calls[0]?.[0]).toMatchObject({ amountCzk: '2000.00' });
  }),
);

it.live('edits and voids a recorded expense with explicit reasons', () =>
  Effect.gen(function* editAndVoid() {
    render(<ExpensesPage />);
    yield* openJob();

    fireEvent.click(screen.getByRole('button', { name: 'list.edit' }));
    const amount = yield* Effect.promise(() => screen.findByLabelText(/^form\.amount/u));
    fireEvent.change(amount, { target: { value: '4000.00' } });
    fireEvent.change(screen.getByLabelText(/^form\.changeReason/u), {
      target: { value: 'Oprava podle vážního lístku' },
    });
    fireEvent.submit(yield* formOf(amount));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeUpdateJobExpense).toHaveBeenCalledTimes(1)));
    expect(mocks.executeUpdateJobExpense.mock.calls[0]?.[0]).toMatchObject({
      amountCzk: '4000.00',
      changeReason: 'Oprava podle vážního lístku',
      expectedRevision: 1,
      id: expense.ref.resourceId,
    });

    yield* Effect.promise(() => screen.findByRole('button', { name: 'list.void' }));
    fireEvent.click(screen.getByRole('button', { name: 'list.void' }));
    const voidReason = yield* Effect.promise(() => screen.findByLabelText(/^void\.reason/u));
    fireEvent.change(voidReason, { target: { value: 'Náklad patří k jiné zakázce' } });
    fireEvent.submit(yield* formOf(voidReason));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeVoidJobExpense).toHaveBeenCalledTimes(1)));
    expect(mocks.executeVoidJobExpense.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 1,
      id: expense.ref.resourceId,
      voidReason: 'Náklad patří k jiné zakázce',
    });
  }),
);

it.live('resets the draft when switching between expense and add forms', () =>
  Effect.gen(function* resetDraft() {
    const second = {
      ...expenseFixture('70000000-0000-4000-8000-000000000003'),
      amountCzk: '900.00',
      description: 'Druhý náklad',
    };
    mocks.executeJobExpenseList.mockReturnValue(Effect.succeed({ items: [expense, second], nextCursor: null }));
    render(<ExpensesPage />);
    yield* openJob();

    const firstEdit = yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLElement))(
      screen.getAllByRole('button', { name: 'list.edit' })[0],
    );
    fireEvent.click(firstEdit);
    const description = yield* Effect.promise(() => screen.findByLabelText('form.description'));
    fireEvent.change(description, { target: { value: 'Rozepsaný první náklad' } });
    const secondEdit = yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLElement))(
      screen.getAllByRole('button', { name: 'list.edit' })[1],
    );
    fireEvent.click(secondEdit);
    expect(screen.getByLabelText('form.description')).toHaveProperty('value', 'Druhý náklad');

    fireEvent.click(screen.getByRole('button', { name: 'list.add' }));
    expect(screen.getByLabelText('form.description')).toHaveProperty('value', '');
  }),
);

it.live('reloads current data after a revision conflict before another edit', () =>
  Effect.gen(function* refreshConflict() {
    mocks.executeUpdateJobExpense.mockReturnValue(
      Effect.fail(
        UpdateJobExpenseActionConflictProblemSchema.make({
          code: 'revision_conflict',
          detail: 'Stale revision',
          status: 409,
          title: 'Conflict',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<ExpensesPage />);
    yield* openJob();
    fireEvent.click(screen.getByRole('button', { name: 'list.edit' }));
    const reason = yield* Effect.promise(() => screen.findByLabelText(/^form\.changeReason/u));
    fireEvent.change(reason, { target: { value: 'Oprava po kontrole' } });
    fireEvent.submit(yield* formOf(reason));
    yield* Effect.promise(() => screen.findByText('error.conflict'));
    expect(screen.queryByText('form.editTitle')).toBeNull();

    mocks.executeJobExpenseList.mockReturnValue(
      Effect.succeed({ items: [{ ...expense, revision: 2 }], nextCursor: null }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeJobExpenseList).toHaveBeenCalledTimes(2)));
    expect(screen.queryByText('error.conflict')).toBeNull();
  }),
);

it.live('ignores a late expense page after switching Jobs', () =>
  Effect.gen(function* isolatePagination() {
    const secondJob = {
      ...jobFixture('60000000-0000-4000-8000-000000000003'),
      serviceScope: { ...job.serviceScope, description: 'Zakázka B' },
    };
    const secondExpense = {
      ...expenseFixture('70000000-0000-4000-8000-000000000004'),
      description: 'Náklad B',
      serviceJobRef: secondJob.ref,
    };
    const lateExpense = {
      ...expenseFixture('70000000-0000-4000-8000-000000000005'),
      description: 'Pozdní náklad A',
    };
    const latePage = yield* Deferred.make<{ items: readonly (typeof expense)[]; nextCursor: string | null }>();
    mocks.executeJobSelection.mockReturnValue(Effect.succeed({ items: [job, secondJob], nextCursor: null }));
    mocks.executeJobExpenseList.mockImplementation((input) => {
      if (input.cursor !== undefined) {
        return Deferred.await(latePage);
      }
      return input.serviceJobRef.resourceId === secondJob.ref.resourceId
        ? Effect.succeed({ items: [secondExpense], nextCursor: null })
        : Effect.succeed({ items: [expense], nextCursor: 'page-2' });
    });

    render(<ExpensesPage />);
    const firstOpen = yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLElement))(
      (yield* Effect.promise(() => screen.findAllByRole('button', { name: 'jobs.open' })))[0],
    );
    fireEvent.click(firstOpen);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'list.loadMore' })));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeJobExpenseList).toHaveBeenCalledTimes(2)));
    fireEvent.click(screen.getByRole('button', { name: 'jobs.back' }));
    const secondOpen = yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLElement))(
      screen.getAllByRole('button', { name: 'jobs.open' })[1],
    );
    fireEvent.click(secondOpen);
    yield* Effect.promise(() => screen.findByText('Náklad B'));
    yield* Deferred.succeed(latePage, { items: [lateExpense], nextCursor: null });
    yield* Effect.forEach([1, 2, 3], () => Effect.yieldNow, { discard: true });
    expect(screen.getByText('Náklad B')).toBeTruthy();
    expect(screen.queryByText('Pozdní náklad A')).toBeNull();
  }),
);

it.live('shows no-cost and VAT-incomparable economics without fabricating a difference or margin', () =>
  Effect.gen(function* comparisonStates() {
    mocks.executeJobEconomics.mockReturnValue(
      Effect.succeed({
        ...economics,
        activeCount: 0,
        categoryTotals: { DISPOSAL: '0.00', MATERIAL: '0.00', OTHER: '0.00', TRANSPORT: '0.00', WORK: '0.00' },
        comparisonReason: 'NO_RECORDED_COSTS' as const,
        differenceCzk: null,
        marginPercent: null,
        recordedCostTotal: '0.00',
      }),
    );
    const first = render(<ExpensesPage />);
    yield* openJob();
    expect(yield* Effect.promise(() => screen.findByText('comparison.NO_RECORDED_COSTS'))).toBeTruthy();
    expect(screen.queryByText(/100\.00.*%/u)).toBeNull();
    first.unmount();

    mocks.executeJobSelection.mockReturnValue(
      Effect.succeed({ items: [jobFixture(undefined, 'INCLUDING_VAT', '24200.00')], nextCursor: null }),
    );
    mocks.executeJobEconomics.mockReturnValue(
      Effect.succeed({
        ...economics,
        activeCount: 0,
        agreedPriceCzk: '24200.00',
        comparisonReason: 'PRICE_BASIS_NOT_COMPARABLE' as const,
        differenceCzk: null,
        marginPercent: null,
        priceBasis: 'INCLUDING_VAT' as const,
        recordedCostTotal: '0.00',
      }),
    );
    render(<ExpensesPage />);
    yield* openJob();
    expect(yield* Effect.promise(() => screen.findByText('comparison.PRICE_BASIS_NOT_COMPARABLE'))).toBeTruthy();
    expect(screen.getByText('priceBasis.INCLUDING_VAT')).toBeTruthy();
    expect(screen.queryByText(/difference.*24/u)).toBeNull();
  }),
);

it.live('renders honest loading and empty job-selection states', () =>
  Effect.gen(function* loadingAndEmpty() {
    mocks.executeJobSelection.mockReturnValue(Effect.never);
    const first = render(<ExpensesPage />);
    expect(yield* Effect.promise(() => screen.findByText('loading.jobs'))).toBeTruthy();
    expect(screen.queryByText('jobs.empty')).toBeNull();
    first.unmount();

    mocks.executeJobSelection.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
    render(<ExpensesPage />);
    expect(yield* Effect.promise(() => screen.findByText('jobs.empty'))).toBeTruthy();
  }),
);

it.live('rejects invalid money before the Action and recovers an uncertain commit without a new key', () =>
  Effect.gen(function* recovery() {
    mocks.executeRecordJobExpense.mockReturnValue(
      Effect.fail(
        RecordJobExpenseActionUnavailableProblemSchema.make({
          code: 'job_expenses_unavailable',
          detail: 'Offline',
          retryable: true,
          status: 503,
          title: 'Offline',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<ExpensesPage />);
    yield* openJob();
    fireEvent.click(screen.getByRole('button', { name: 'list.add' }));
    fireEvent.change(yield* Effect.promise(() => screen.findByLabelText('form.description')), {
      target: { value: 'Práce' },
    });
    fireEvent.change(screen.getByLabelText(/^form\.amount/u), { target: { value: '-1.00' } });
    const date = screen.getByLabelText(/^form\.incurredOn/u);
    fireEvent.change(date, { target: { value: '2026-09-24' } });
    fireEvent.submit(yield* formOf(date));
    yield* Effect.promise(() => screen.findByText('error.validation'));
    expect(mocks.executeRecordJobExpense).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^form\.amount/u), { target: { value: '10.00' } });
    fireEvent.submit(yield* formOf(date));
    yield* Effect.promise(() => screen.findByText('error.unavailable'));
    const firstOptions = mocks.executeRecordJobExpense.mock.calls[0]?.[2];
    mocks.executeRecordJobExpense.mockReturnValue(
      Effect.fail(
        RecordJobExpenseActionCommitIndeterminateProblemSchema.make({
          detail: 'Unknown',
          invocationId: '80000000-0000-4000-8000-000000000001',
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Unknown',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    yield* Effect.promise(() => screen.findByText('error.uncertain'));
    expect(mocks.executeRecordJobExpense.mock.calls[1]?.[2]).toEqual(firstOptions);
    fireEvent.click(screen.getByRole('button', { name: 'resolve' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeJobExpensesCommitStatus).toHaveBeenCalledTimes(1)));
  }),
);

for (const [failure, kind] of [
  [
    JobSelectionAuthenticationProblemSchema.make({
      detail: 'Failure',
      status: 401,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'authentication',
  ],
  [
    JobSelectionForbiddenProblemSchema.make({
      detail: 'Failure',
      status: 403,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'forbidden',
  ],
  [
    JobSelectionUnavailableProblemSchema.make({
      detail: 'Failure',
      retryable: true,
      status: 503,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'unavailable',
  ],
] as const) {
  it.live(`maps ${kind} job-selection state without a false empty result`, () =>
    Effect.gen(function* selectionFailure() {
      mocks.executeJobSelection.mockReturnValue(Effect.fail(failure));
      render(<ExpensesPage />);
      yield* Effect.promise(() => screen.findByText(`error.${kind}`));
      expect(screen.queryByText('jobs.empty')).toBeNull();
    }),
  );
}
