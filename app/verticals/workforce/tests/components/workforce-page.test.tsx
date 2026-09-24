import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, rstest, it } from 'effect-rstest';
import { Effect, Option, Schema } from 'effect';
import WorkforcePage from '../../src/routes/[lang]/workforce/page.tsx';
import { workerFixture, jobFixture } from '../fixtures.ts';
import {
  WorkerListAuthenticationProblemSchema,
  WorkerListForbiddenProblemSchema,
  WorkerListUnavailableProblemSchema,
} from '../../shared/apis/worker-list.ts';
import { WorkerDetailNotFoundProblemSchema } from '../../shared/apis/worker-detail.ts';
import {
  CreateWorkerActionCommitIndeterminateProblemSchema,
  CreateWorkerActionUnavailableProblemSchema,
} from '../../shared/apis/create-worker-action.ts';

const mocks = rstest.hoisted(() => ({
  executeAddAbsence: rstest.fn(),
  executeAssignWorker: rstest.fn(),
  executeAvailableWorkers: rstest.fn(),
  executeChangeWorkerStatus: rstest.fn(),
  executeCreateWorker: rstest.fn(),
  executeRemoveAbsence: rstest.fn(),
  executeUnassignWorker: rstest.fn(),
  executeUpdateWorker: rstest.fn(),
  executeWeeklySchedule: rstest.fn(),
  executeWorkerDetail: rstest.fn(),
  executeWorkerList: rstest.fn(),
  executeWorkforceCommitStatus: rstest.fn(),
}));
rstest.mock('../../src/api/worker-list-client.ts', () => ({ executeWorkerList: mocks.executeWorkerList }));
rstest.mock('../../src/api/worker-detail-client.ts', () => ({ executeWorkerDetail: mocks.executeWorkerDetail }));
rstest.mock('../../src/api/weekly-schedule-client.ts', () => ({ executeWeeklySchedule: mocks.executeWeeklySchedule }));
rstest.mock('../../src/api/available-workers-client.ts', () => ({
  executeAvailableWorkers: mocks.executeAvailableWorkers,
}));
rstest.mock('../../src/api/workforce-commit-status-client.ts', () => ({
  executeWorkforceCommitStatus: mocks.executeWorkforceCommitStatus,
}));
rstest.mock('../../src/api/create-worker-action-client.ts', () => ({ executeCreateWorker: mocks.executeCreateWorker }));
rstest.mock('../../src/api/update-worker-action-client.ts', () => ({ executeUpdateWorker: mocks.executeUpdateWorker }));
rstest.mock('../../src/api/change-worker-status-action-client.ts', () => ({
  executeChangeWorkerStatus: mocks.executeChangeWorkerStatus,
}));
rstest.mock('../../src/api/add-absence-action-client.ts', () => ({ executeAddAbsence: mocks.executeAddAbsence }));
rstest.mock('../../src/api/remove-absence-action-client.ts', () => ({
  executeRemoveAbsence: mocks.executeRemoveAbsence,
}));
rstest.mock('../../src/api/assign-worker-action-client.ts', () => ({ executeAssignWorker: mocks.executeAssignWorker }));
rstest.mock('../../src/api/unassign-worker-action-client.ts', () => ({
  executeUnassignWorker: mocks.executeUnassignWorker,
}));
rstest.mock('../../src/api/dependency-read-gateway.ts', () => ({
  dependencyReadGateway: { invoke: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect },
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  useModernI18n: () => ({ t: (key: string) => key.replace('workforce.demo.', '') }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));
const worker = workerFixture();
const job = jobFixture('60000000-0000-4000-8000-000000000001');
beforeEach(() => {
  rstest.stubGlobal('ULTRAMODERN_WORKFORCE_API_BASE_URL', '/workforce-api');
  mocks.executeWorkerList.mockReturnValue(Effect.succeed({ items: [worker] }));
  mocks.executeWorkerDetail.mockReturnValue(Effect.succeed({ absences: [], jobs: [], worker }));
  mocks.executeWeeklySchedule.mockReturnValue(Effect.succeed({ items: [{ crew: [], job }] }));
  mocks.executeAvailableWorkers.mockReturnValue(
    Effect.succeed({
      items: [{ assigned: false, availability: { absenceReason: Option.none(), state: 'AVAILABLE' }, worker }],
    }),
  );
  mocks.executeCreateWorker.mockReturnValue(Effect.succeed(worker));
  mocks.executeUpdateWorker.mockReturnValue(Effect.succeed(worker));
  mocks.executeChangeWorkerStatus.mockReturnValue(Effect.succeed(worker));
  mocks.executeAddAbsence.mockReturnValue(Effect.succeed(worker));
  mocks.executeRemoveAbsence.mockReturnValue(Effect.succeed(worker));
  mocks.executeAssignWorker.mockReturnValue(Effect.succeed(worker));
  mocks.executeUnassignWorker.mockReturnValue(Effect.succeed(worker));
  mocks.executeWorkforceCommitStatus.mockReturnValue(Effect.succeed({ retryCommand: false, state: 'COMMITTED' }));
});
afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});
const formOf = (field: HTMLElement) =>
  Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(field.closest('form'));
const fillCreate = Effect.fn(function* fillCreate() {
  fireEvent.click(screen.getByRole('button', { name: 'newWorker' }));
  const name = screen.getByLabelText(/name/u);
  fireEvent.change(name, { target: { value: 'Petr Novák' } });
  fireEvent.change(screen.getByLabelText(/validFrom/u), { target: { value: '2026-01-01' } });
  fireEvent.submit(yield* formOf(name));
});
it.live('lists, searches, filters and opens a worker using semantic cards and a callable phone', () =>
  Effect.gen(function* browse() {
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText(worker.displayName));
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Nobody' } });
    expect(screen.getByText('noResults')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'Petr' } });
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    yield* Effect.promise(() => screen.findByText('noAbsences'));
    expect(screen.getByRole('link', { name: '+420777123456' }).getAttribute('href')).toBe('tel:+420777123456');
    expect(screen.getByLabelText(/hourlyCost/u)).toHaveProperty('value', '180.00');
  }),
);
it.live('shows loading and empty states', () =>
  Effect.gen(function* empty() {
    mocks.executeWorkerList.mockReturnValue(Effect.never);
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText('loading'));
    cleanup();
    mocks.executeWorkerList.mockReturnValue(Effect.succeed({ items: [] }));
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText('noWorkers'));
  }),
);
for (const [schema, status, kind] of [
  [WorkerListAuthenticationProblemSchema, 401, 'authentication'],
  [WorkerListForbiddenProblemSchema, 403, 'forbidden'],
  [WorkerListUnavailableProblemSchema, 503, 'unavailable'],
] as const) {
  it.live(`maps ${kind} without a false empty state`, () =>
    Effect.gen(function* readFailure() {
      const error = yield* Schema.decodeUnknownEffect(schema)({
        _tag: `WorkerList${kind[0]?.toUpperCase()}${kind.slice(1)}Problem`,
        detail: 'Failure',
        retryable: true,
        status,
        title: 'Failure',
        type: 'https://ontos.dev/test',
      });
      mocks.executeWorkerList.mockReturnValue(Effect.fail(error));
      render(<WorkforcePage />);
      yield* Effect.promise(() => screen.findByText(`error.${kind}`));
      expect(screen.queryByText('noWorkers')).toBeNull();
    }),
  );
}
it.live('shows a not-found detail', () =>
  Effect.gen(function* missing() {
    mocks.executeWorkerDetail.mockReturnValue(
      Effect.fail(
        WorkerDetailNotFoundProblemSchema.make({
          detail: 'Missing',
          status: 404,
          title: 'Missing',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<WorkforcePage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    yield* Effect.promise(() => screen.findByText('error.notFound'));
  }),
);
it.live('creates a worker, validates cost, and disables mutations while pending', () =>
  Effect.gen(function* create() {
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText(worker.displayName));
    mocks.executeCreateWorker.mockReturnValue(Effect.never);
    yield* fillCreate();
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeCreateWorker).toHaveBeenCalledTimes(1)));
    expect(screen.getByRole('button', { name: 'save' }).closest('fieldset')).toHaveProperty('disabled', true);
    expect(screen.getByText('saving')).toBeTruthy();
  }),
);
it.live('rejects invalid decimal input before calling the Action', () =>
  Effect.gen(function* invalidCost() {
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText(worker.displayName));
    fireEvent.click(screen.getByRole('button', { name: 'newWorker' }));
    fireEvent.change(screen.getByLabelText(/name/u), { target: { value: 'Petr' } });
    fireEvent.change(screen.getByLabelText(/validFrom/u), { target: { value: '2026-01-01' } });
    const cost = screen.getByLabelText(/hourlyCost/u);
    fireEvent.change(cost, { target: { value: '-50' } });
    fireEvent.submit(yield* formOf(cost));
    yield* Effect.promise(() => screen.findByText('error.validation'));
    expect(mocks.executeCreateWorker).not.toHaveBeenCalled();
  }),
);
it.live('retries with the original idempotency key then resolves uncertainty before allowing another mutation', () =>
  Effect.gen(function* recovery() {
    mocks.executeCreateWorker.mockReturnValue(
      Effect.fail(
        CreateWorkerActionUnavailableProblemSchema.make({
          code: 'workforce_unavailable',
          detail: 'Offline',
          retryable: true,
          status: 503,
          title: 'Offline',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText(worker.displayName));
    yield* fillCreate();
    yield* Effect.promise(() => screen.findByText('error.unavailable'));
    const original = mocks.executeCreateWorker.mock.calls[0]?.[2];
    mocks.executeCreateWorker.mockReturnValue(
      Effect.fail(
        CreateWorkerActionCommitIndeterminateProblemSchema.make({
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
    expect(mocks.executeCreateWorker.mock.calls[1]?.[2]).toEqual(original);
    expect(screen.getByRole('button', { name: 'newWorker' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'resolve' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeWorkforceCommitStatus).toHaveBeenCalledTimes(1)));
    yield* Effect.promise(() => screen.findByText('noAbsences'));
    expect(mocks.executeCreateWorker).toHaveBeenCalledTimes(2);
  }),
);
it.live('shows unassigned work and refuses unavailable candidates while allowing available crew', () =>
  Effect.gen(function* crew() {
    mocks.executeAvailableWorkers.mockReturnValue(
      Effect.succeed({
        items: [{ assigned: false, availability: { absenceReason: Option.none(), state: 'JOB_CONFLICT' }, worker }],
      }),
    );
    render(<WorkforcePage />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule' }));
    yield* Effect.promise(() => screen.findByText('noCrew'));
    fireEvent.click(screen.getByRole('button', { name: 'manageCrew' }));
    yield* Effect.promise(() => screen.findByText('availability.JOB_CONFLICT'));
    expect(screen.getByRole('button', { name: 'assign' })).toHaveProperty('disabled', true);
    expect(mocks.executeAssignWorker).not.toHaveBeenCalled();
  }),
);
it.live('keeps historical crews read-only and disables unknown-duration assignment', () =>
  Effect.gen(function* readonlyCrew() {
    mocks.executeWeeklySchedule.mockReturnValue(
      Effect.succeed({ items: [{ crew: [], job: { ...job, expectedDurationMinutes: Option.none() } }] }),
    );
    render(<WorkforcePage />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule' }));
    yield* Effect.promise(() => screen.findByText('unknownDurationHelp'));
    expect(screen.getByRole('button', { name: 'manageCrew' })).toHaveProperty('disabled', true);
    cleanup();
    mocks.executeWeeklySchedule.mockReturnValue(
      Effect.succeed({
        items: [
          {
            crew: [{ assigned: true, availability: { absenceReason: Option.none(), state: 'AVAILABLE' }, worker }],
            job: { ...job, status: 'COMPLETED' },
          },
        ],
      }),
    );
    render(<WorkforcePage />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule' }));
    yield* Effect.promise(() => screen.findByText('crewReadonly'));
    expect(screen.queryByRole('button', { name: 'manageCrew' })).toBeNull();
  }),
);

it.live('successfully creates, edits and adds an absence through the page', () =>
  Effect.gen(function* editAndAbsence() {
    render(<WorkforcePage />);
    yield* Effect.promise(() => screen.findByText(worker.displayName));
    yield* fillCreate();
    yield* Effect.promise(() => screen.findByText('noAbsences'));
    const name = screen.getByLabelText(/name/u);
    fireEvent.change(name, { target: { value: 'Petr Řidič' } });
    fireEvent.submit(yield* formOf(name));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeUpdateWorker).toHaveBeenCalledTimes(1)));
    yield* Effect.promise(() => screen.findByText('noAbsences'));
    const from = screen.getByLabelText(/dateFrom/u);
    fireEvent.change(from, { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText(/dateTo/u), { target: { value: '2026-10-18' } });
    fireEvent.submit(yield* formOf(from));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeAddAbsence).toHaveBeenCalledTimes(1)));
    expect(mocks.executeAddAbsence).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-10-15',
        dateTo: '2026-10-18',
        reason: 'VACATION',
        workerId: worker.ref.resourceId,
      }),
      expect.any(String),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  }),
);
it.live('assigns an available worker through the generated command', () =>
  Effect.gen(function* assignCrew() {
    render(<WorkforcePage />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'manageCrew' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'assign' })));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeAssignWorker).toHaveBeenCalledTimes(1)));
    expect(mocks.executeAssignWorker).toHaveBeenCalledWith(
      { jobRef: job.ref, workerId: worker.ref.resourceId },
      expect.any(String),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  }),
);

it.live('removes existing planned crew even when Jobs clears the duration', () =>
  Effect.gen(function* removeIncompleteCrew() {
    mocks.executeWeeklySchedule.mockReturnValue(
      Effect.succeed({
        items: [
          {
            crew: [{ assigned: true, availability: { absenceReason: Option.none(), state: 'UNAVAILABLE' }, worker }],
            job: { ...job, expectedDurationMinutes: Option.none() },
          },
        ],
      }),
    );
    render(<WorkforcePage />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'unassign' })));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeUnassignWorker).toHaveBeenCalledTimes(1)));
    expect(mocks.executeUnassignWorker).toHaveBeenCalledWith(
      { jobRef: job.ref, workerId: worker.ref.resourceId },
      expect.any(String),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(mocks.executeAssignWorker).not.toHaveBeenCalled();
  }),
);
