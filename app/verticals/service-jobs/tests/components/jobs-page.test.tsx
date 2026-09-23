import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, rstest, it } from 'effect-rstest';
import { Effect, Option, Schema } from 'effect';
import JobsPage from '../../src/routes/[lang]/jobs/page.tsx';
import { ServiceJobSchema } from '../../shared/resources/service-job.ts';
import {
  JobListAuthenticationProblemSchema,
  JobListForbiddenProblemSchema,
  JobListUnavailableProblemSchema,
} from '../../shared/apis/job-list.ts';
import { CreateServiceJobActionCommitIndeterminateProblemSchema } from '../../shared/apis/create-service-job-action.ts';
import {
  ScheduleServiceJobActionUnavailableProblemSchema,
  ScheduleServiceJobActionConflictProblemSchema,
} from '../../shared/apis/schedule-service-job-action.ts';
import { JobDetailNotFoundProblemSchema } from '../../shared/apis/job-detail.ts';

rstest.mock('@modern-js/plugin-tanstack/runtime', () => ({ useSearch: () => ({}) }));
const mocks = rstest.hoisted(() => ({
  executeAcceptedSourceSelection: rstest.fn(),
  executeCompleteServiceJob: rstest.fn(),
  executeCreateServiceJob: rstest.fn(),
  executeJobCommitStatus: rstest.fn(),
  executeJobDetail: rstest.fn(),
  executeJobList: rstest.fn(),
  executePartyDisplay: rstest.fn(),
  executeScheduleServiceJob: rstest.fn(),
  executeStartServiceJob: rstest.fn(),
  executeUpdateExecution: rstest.fn(),
}));
rstest.mock('../../src/api/job-list-client.ts', () => ({ executeJobList: mocks.executeJobList }));
rstest.mock('../../src/api/job-detail-client.ts', () => ({ executeJobDetail: mocks.executeJobDetail }));
rstest.mock('../../src/api/accepted-source-selection-client.ts', () => ({
  executeAcceptedSourceSelection: mocks.executeAcceptedSourceSelection,
}));
rstest.mock('../../src/api/party-display-client.ts', () => ({ executePartyDisplay: mocks.executePartyDisplay }));
rstest.mock('../../src/api/job-commit-status-client.ts', () => ({
  executeJobCommitStatus: mocks.executeJobCommitStatus,
}));
rstest.mock('../../src/api/complete-service-job-action-client.ts', () => ({
  executeCompleteServiceJob: mocks.executeCompleteServiceJob,
}));
rstest.mock('../../src/api/create-service-job-action-client.ts', () => ({
  executeCreateServiceJob: mocks.executeCreateServiceJob,
}));
rstest.mock('../../src/api/schedule-service-job-action-client.ts', () => ({
  executeScheduleServiceJob: mocks.executeScheduleServiceJob,
}));
rstest.mock('../../src/api/update-execution-action-client.ts', () => ({
  executeUpdateExecution: mocks.executeUpdateExecution,
}));
rstest.mock('../../src/api/start-service-job-action-client.ts', () => ({
  executeStartServiceJob: mocks.executeStartServiceJob,
}));
rstest.mock('../../src/api/dependency-read-gateway.ts', () => ({
  dependencyReadGateway: { invoke: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect },
  partyReadGateway: { invoke: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect },
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  useModernI18n: () => ({ t: (key: string) => key.replace('service-jobs.demo.', '') }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));
const job = Schema.decodeSync(ServiceJobSchema)({
  acceptance: { evidenceNote: 'Confirmed', method: 'PHONE' },
  acceptedAt: '2026-09-22T10:00:00.000Z',
  checklist: { accessChecked: false, cleared: false, handedOver: false, wasteRemoved: false },
  commercialSummary: { currency: 'CZK', priceBasis: 'EXCLUDING_VAT', total: '17300.00' },
  completedAt: null,
  createdAt: '2026-09-23T08:00:00.000Z',
  executionNote: '',
  expectedDurationMinutes: null,
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  partyRef: {
    moduleId: 'party.registry',
    resourceId: '20000000-0000-4000-8000-000000000001',
    resourceType: 'party.registry.party',
    tenantId: '30000000-0000-4000-8000-000000000001',
  },
  ref: {
    moduleId: 'service.jobs',
    resourceId: '10000000-0000-4000-8000-000000000001',
    resourceType: 'service.jobs.service-job',
    tenantId: '30000000-0000-4000-8000-000000000001',
  },
  revision: 1,
  scheduledStartAt: null,
  serviceLocation: { addressLine: 'Dlouhá 12', city: 'Praha', countryCode: 'CZ', postalCode: '11000' },
  serviceScope: {
    description: 'Vyklizení',
    elevator: false,
    estimatedVolumeM3: '15',
    floor: 2,
    objectType: 'APARTMENT',
    specialWaste: null,
  },
  sourceRef: {
    moduleId: 'sales.inquiries',
    resourceId: '60000000-0000-4000-8000-000000000001',
    resourceType: 'sales.inquiries.sales-inquiry',
    tenantId: '30000000-0000-4000-8000-000000000001',
  },
  sourceRevision: 5,
  startedAt: null,
  status: 'NEW',
  updatedAt: '2026-09-23T08:00:00.000Z',
});
const contact = { archived: false, partyRef: job.partyRef, partyType: 'PERSON', title: 'Jan Novák' };
beforeEach(() => {
  rstest.stubGlobal('ULTRAMODERN_SERVICE_JOBS_API_BASE_URL', '/service-jobs-api');
  mocks.executeJobList.mockReturnValue(Effect.succeed({ items: [job] }));
  mocks.executePartyDisplay.mockReturnValue(Effect.succeed(contact));
  mocks.executeJobDetail.mockReturnValue(Effect.succeed(job));
  mocks.executeAcceptedSourceSelection.mockReturnValue(
    Effect.succeed({ items: [{ serviceLocation: job.serviceLocation, sourceRef: job.sourceRef }] }),
  );
  mocks.executeCreateServiceJob.mockReturnValue(Effect.succeed(job));
  mocks.executeScheduleServiceJob.mockReturnValue(Effect.succeed({ ...job, revision: 2 }));
});
afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});
it.live('provides Start and Complete as primary actions and retains execution facts', () =>
  Effect.gen(function* primaryActions() {
    const planned = { ...job, status: 'PLANNED' as const };
    const running = { ...planned, revision: 2, status: 'IN_PROGRESS' as const };
    const done = { ...running, revision: 3, status: 'COMPLETED' as const };
    mocks.executeJobDetail.mockReturnValue(Effect.succeed(planned));
    mocks.executeStartServiceJob.mockReturnValue(Effect.succeed(running));
    mocks.executeCompleteServiceJob.mockReturnValue(Effect.succeed(done));
    render(<JobsPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'start' })));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'complete' })));
    expect(yield* Effect.promise(() => screen.findByText('billingReady'))).toBeTruthy();
  }),
);
it.live('keeps the entered schedule after retryable failure and retries the same idempotency key', () =>
  Effect.gen(function* preserveSchedule() {
    mocks.executeScheduleServiceJob
      .mockReturnValueOnce(
        Effect.fail(
          ScheduleServiceJobActionUnavailableProblemSchema.make({
            code: 'job_unavailable',
            detail: 'Offline',
            retryable: true,
            status: 503,
            title: 'Offline',
            type: 'https://ontos.dev/test',
          }),
        ),
      )
      .mockReturnValue(Effect.succeed({ ...job, revision: 2, status: 'PLANNED' }));
    render(<JobsPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    const input = yield* Effect.promise(() => screen.findByLabelText(/scheduledStartAt/u));
    fireEvent.change(input, { target: { value: '2026-09-24T10:30' } });
    fireEvent.submit(yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(input.closest('form')));
    expect(yield* Effect.promise(() => screen.findByText('error.unavailable'))).toBeTruthy();
    expect((yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLInputElement))(input)).value).toBe(
      '2026-09-24T10:30',
    );
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeScheduleServiceJob).toHaveBeenCalledTimes(2)));
    expect(mocks.executeScheduleServiceJob.mock.calls[0]?.[2]).toEqual(
      mocks.executeScheduleServiceJob.mock.calls[1]?.[2],
    );
  }),
);
it.live('renders responsive list and opens service details through the generated read', () =>
  Effect.gen(function* componentScenario1() {
    const view = render(<JobsPage />);
    expect(yield* Effect.promise(() => screen.findByText('Jan Novák'))).toBeTruthy();
    expect(view.container.querySelector('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'))).toBeTruthy();

    expect(mocks.executeJobDetail).toHaveBeenCalledWith({ target: { id: job.ref.resourceId } }, expect.any(String), {
      baseUrl: '/service-jobs-api',
    });
    expect(screen.getByRole('button', { name: 'saveSchedule' })).toBeTruthy();
  }),
);
it.live('preserves schedule and execution drafts across conflict refresh', () =>
  Effect.gen(function* preserveConflictDraft() {
    mocks.executeScheduleServiceJob.mockReturnValue(
      Effect.fail(
        ScheduleServiceJobActionConflictProblemSchema.make({
          code: 'revision_conflict',
          detail: 'Changed',
          status: 409,
          title: 'Conflict',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<JobsPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    const date = yield* Effect.promise(() => screen.findByLabelText(/scheduledStartAt/u));
    fireEvent.change(date, { target: { value: '2026-09-24T10:30' } });
    fireEvent.change(screen.getByLabelText('executionNote'), { target: { value: 'Rozepsaná poznámka' } });
    fireEvent.submit(yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(date.closest('form')));
    yield* Effect.promise(() => screen.findByText('error.conflict'));
    mocks.executeJobDetail.mockReturnValue(
      Effect.succeed({ ...job, expectedDurationMinutes: Option.some(90), revision: 7 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeJobDetail).toHaveBeenCalledTimes(2)));
    yield* Effect.promise(() =>
      waitFor(() => expect(screen.getByLabelText('expectedDurationMinutes')).toHaveProperty('value', '90')),
    );
    expect(
      (yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLInputElement))(screen.getByLabelText('executionNote')))
        .value,
    ).toBe('Rozepsaná poznámka');
    expect(
      (yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLInputElement))(
        screen.getByLabelText(/scheduledStartAt/u),
      )).value,
    ).toBe('2026-09-24T10:30');
    mocks.executeScheduleServiceJob.mockReturnValue(Effect.succeed({ ...job, revision: 8, status: 'PLANNED' }));
    fireEvent.submit(yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLFormElement))(date.closest('form')));
    yield* Effect.promise(() =>
      waitFor(() =>
        expect(mocks.executeScheduleServiceJob).toHaveBeenLastCalledWith(
          expect.objectContaining({ expectedRevision: 7 }),
          expect.any(String),
          expect.any(Object),
        ),
      ),
    );
    expect(
      (yield* Schema.decodeUnknownEffect(Schema.instanceOf(HTMLInputElement))(screen.getByLabelText('executionNote')))
        .value,
    ).toBe('Rozepsaná poznámka');
  }),
);
it.live('shows loading and empty states', () =>
  Effect.gen(function* componentScenario2() {
    mocks.executeJobList.mockReturnValue(Effect.never);
    const view = render(<JobsPage />);
    expect(screen.getByText('loading')).toBeTruthy();
    view.unmount();
    mocks.executeJobList.mockReturnValue(Effect.succeed({ items: [] }));
    render(<JobsPage />);
    expect(yield* Effect.promise(() => screen.findByText('empty'))).toBeTruthy();
  }),
);
it.live.each([
  {
    failure: JobListAuthenticationProblemSchema.make({
      detail: 'Authentication',
      status: 401,
      title: 'Authentication',
      type: 'https://ontos.dev/test',
    }),
    kind: 'authentication',
  },
  {
    failure: JobListForbiddenProblemSchema.make({
      detail: 'Denied',
      status: 403,
      title: 'Denied',
      type: 'https://ontos.dev/test',
    }),
    kind: 'forbidden',
  },
  {
    failure: JobListUnavailableProblemSchema.make({
      detail: 'Offline',
      retryable: true,
      status: 503,
      title: 'Offline',
      type: 'https://ontos.dev/test',
    }),
    kind: 'unavailable',
  },
])('keeps the %s failure visible with a refresh action', ({ failure, kind }) =>
  Effect.gen(function* componentScenario3() {
    mocks.executeJobList.mockReturnValue(Effect.fail(failure));
    render(<JobsPage />);
    expect((yield* Effect.promise(() => screen.findByRole('alert'))).textContent).toContain(`error.${kind}`);
    expect(screen.getByRole('button', { name: 'refresh' })).toBeTruthy();
  }),
);
it.live('shows not found instead of opening a missing job', () =>
  Effect.gen(function* componentScenario4() {
    mocks.executeJobDetail.mockReturnValue(
      Effect.fail(
        JobDetailNotFoundProblemSchema.make({
          detail: 'Missing',
          status: 404,
          title: 'Missing',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    render(<JobsPage />);
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'open' })));
    expect(yield* Effect.promise(() => screen.findByText('error.notFound'))).toBeTruthy();
  }),
);
it.live('creates only from an accepted source and disables repeated submissions while pending', () =>
  Effect.gen(function* pendingCreation() {
    mocks.executeCreateServiceJob.mockReturnValue(Effect.never);
    render(<JobsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'Dlouhá 12, Praha — create' })));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeCreateServiceJob).toHaveBeenCalledTimes(1)));
    expect(screen.getByRole('button', { name: 'new' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.executeCreateServiceJob).toHaveBeenCalledWith(
      { sourceRef: job.sourceRef },
      expect.any(String),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  }),
);
it.live('opens an existing job returned by source-unique creation', () =>
  Effect.gen(function* existingCreation() {
    mocks.executeJobList.mockReturnValue(Effect.succeed({ items: [] }));
    mocks.executePartyDisplay.mockReturnValue(
      Effect.succeed({
        ...contact,
        partyRef: { ...contact.partyRef, resourceId: '20000000-0000-4000-8000-000000000002' },
      }),
    );
    render(<JobsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'Dlouhá 12, Praha — create' })));
    expect(yield* Effect.promise(() => screen.findByText('Dlouhá 12, 11000 Praha'))).toBeTruthy();
    expect(screen.getByText('17300.00 CZK (priceBasis.EXCLUDING_VAT)')).toBeTruthy();
    expect(yield* Effect.promise(() => screen.findByRole('heading', { name: 'Jan Novák' }))).toBeTruthy();
  }),
);
it.live('filters completed jobs and keeps scheduling disabled for a terminal job', () =>
  Effect.gen(function* completedView() {
    const done = { ...job, status: 'COMPLETED' as const };
    mocks.executeJobList.mockReturnValue(
      Effect.succeed({
        items: [job, { ...done, ref: { ...job.ref, resourceId: '10000000-0000-4000-8000-000000000002' } }],
      }),
    );
    mocks.executeJobDetail.mockReturnValue(Effect.succeed(done));
    render(<JobsPage />);
    yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' }));
    mocks.executeJobList.mockReturnValue(Effect.succeed({ items: [done] }));
    fireEvent.click(screen.getByRole('button', { name: 'view.COMPLETED' }));
    expect(yield* Effect.promise(() => screen.findAllByRole('button', { name: 'open' }))).toHaveLength(1);
    expect(mocks.executeJobList).toHaveBeenLastCalledWith(
      { view: 'COMPLETED' },
      expect.any(String),
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(yield* Effect.promise(() => screen.findByText('billingReady'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'saveSchedule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'start' })).toBeNull();
  }),
);
it.live('holds an uncertain command until commit recovery resolves it', () =>
  Effect.gen(function* uncertainRecovery() {
    mocks.executeCreateServiceJob.mockReturnValue(
      Effect.fail(
        CreateServiceJobActionCommitIndeterminateProblemSchema.make({
          detail: 'Unknown',
          invocationId: job.ref.resourceId,
          resolution: 'RESOLVE_COMMIT',
          retryCommand: false,
          status: 503,
          title: 'Unknown',
          type: 'https://ontos.dev/test',
        }),
      ),
    );
    mocks.executeJobCommitStatus.mockReturnValue(Effect.succeed({ retryCommand: false, state: 'COMMITTED' }));
    render(<JobsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'new' }));
    fireEvent.click(yield* Effect.promise(() => screen.findByRole('button', { name: 'Dlouhá 12, Praha — create' })));
    expect(yield* Effect.promise(() => screen.findByText('error.uncertain'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'new' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'resolve' }));
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeJobCommitStatus).toHaveBeenCalledTimes(1)));
    expect(mocks.executeCreateServiceJob).toHaveBeenCalledTimes(1);
  }),
);
