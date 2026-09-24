import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, rstest } from 'effect-rstest';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import type { DashboardOverviewResponse } from '../../shared/apis/dashboard-overview.ts';
import {
  DashboardOverviewAuthenticationProblemSchema,
  DashboardOverviewForbiddenProblemSchema,
  DashboardOverviewNotFoundProblemSchema,
  DashboardOverviewUnavailableProblemSchema,
} from '../../shared/apis/dashboard-overview.ts';
import { DashboardPage } from '../../src/routes/[lang]/dashboard/page.tsx';

const mocks = rstest.hoisted(() => ({ executeDashboardOverview: rstest.fn() }));

rstest.mock('../../src/api/dashboard-overview-client.ts', () => ({
  executeDashboardOverview: mocks.executeDashboardOverview,
}));
rstest.mock('@modern-js/plugin-i18n/runtime', () => ({
  Link: ({ children, to }: { readonly children: ReactNode; readonly to: string }) => <a href={to}>{children}</a>,
  useModernI18n: () => ({
    language: 'cs',
    t: (key: string) => key.replace('operations-dashboard.pages.dashboard.', ''),
  }),
}));
rstest.mock('../../src/routes/ultramodern-route-head.tsx', () => ({ UltramodernRouteHead: () => null }));

const job = {
  addressLine: 'Dlouhá 12',
  city: 'Praha',
  description: 'Vyklizení bytu 2+1',
  id: 'job-1',
  scheduledStartAt: '2026-09-25T08:00:00.000Z',
  status: 'PLANNED',
} as const;
const unavailable = { retryable: true, state: 'UNAVAILABLE' } as const;
const emptyJobs = { count: { exact: true, value: 0 }, hasMore: false, items: [], state: 'READY' } as const;
const readyResponse: DashboardOverviewResponse = {
  draftInvoices: {
    count: { exact: true, value: 1 },
    hasMore: false,
    items: [
      {
        currency: 'CZK',
        customerDisplayName: 'Jan Novák',
        dueAt: null,
        id: 'invoice-draft-1',
        invoiceNumber: null,
        issuedAt: null,
        sourceJobDisplayName: job.description,
        status: 'DRAFT',
        total: '20000.00',
      },
    ],
    state: 'READY',
  },
  generatedAt: '2026-09-25T07:00:00.000Z',
  inquiries: { count: { exact: true, value: 4 }, state: 'READY' },
  invoiceable: {
    count: { exact: true, value: 1 },
    hasMore: false,
    items: [
      {
        economics: {
          agreedPriceCzk: '20000.00',
          comparisonReason: null,
          currency: 'CZK',
          differenceCzk: '5000.00',
          marginPercent: '25.00',
          recordedCostTotal: '15000.00',
          state: 'READY',
        },
        job,
      },
    ],
    state: 'READY',
  },
  issuedInvoices: {
    count: { exact: true, value: 1 },
    hasMore: false,
    items: [
      {
        currency: 'CZK',
        customerDisplayName: 'ABC s.r.o.',
        dueAt: '2026-10-09T09:00:00.000Z',
        id: 'invoice-issued-1',
        invoiceNumber: '2026-000001',
        issuedAt: '2026-09-25T09:00:00.000Z',
        sourceJobDisplayName: job.description,
        status: 'ISSUED',
        total: '20000.00',
      },
    ],
    state: 'READY',
  },
  jobsInProgress: { count: { exact: true, value: 1 }, hasMore: false, items: [], state: 'READY' },
  jobsToday: { count: { exact: false, value: 100 }, hasMore: true, items: [job], state: 'READY' },
  jobsUpcoming: emptyJobs,
  weeklySchedule: {
    items: [
      {
        crew: [{ availability: 'JOB_CONFLICT', displayName: 'Petr Novák', position: 'Řidič' }],
        job,
      },
    ],
    state: 'READY',
    weekStart: '2026-09-21',
  },
};

beforeEach(() => {
  mocks.executeDashboardOverview.mockReturnValue(Effect.succeed(readyResponse));
});

afterEach(() => {
  cleanup();
  rstest.clearAllMocks();
});

it.live('renders current owner facts as responsive cards and lists', () =>
  Effect.gen(function* readyDashboard() {
    render(<DashboardPage />);
    expect(yield* Effect.promise(() => screen.findByRole('heading', { name: 'title' }))).toBeTruthy();
    const kpis = screen.getByLabelText('kpis');
    expect(kpis.textContent).toContain('4');
    expect(kpis.textContent).toContain('100+');
    expect(screen.getAllByText(job.description).length).toBeGreaterThan(0);
    expect(screen.getAllByText('status.PLANNED').length).toBeGreaterThan(0);
    expect(screen.getByText('crewConflict')).toBeTruthy();
    expect(screen.getByText('25.00 %')).toBeTruthy();
    expect(screen.getByText('2026-000001')).toBeTruthy();
    expect(screen.getAllByText('issuedAt')).toHaveLength(1);
    expect(screen.getByRole('main').className).toContain('min-w-0');
    expect(kpis.className).toContain('grid-cols-1');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('link', { name: /openInquiries/u }).getAttribute('href')).toBe('/inquiries');
    expect(screen.getAllByRole('link', { name: 'showAll' }).map((link) => link.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/jobs', '/workforce', '/invoices']),
    );
  }),
);

it.live('keeps ready sections visible when one provider or economics read is unavailable', () =>
  Effect.gen(function* partialDashboard() {
    mocks.executeDashboardOverview.mockReturnValue(
      Effect.succeed({
        ...readyResponse,
        invoiceable: {
          ...readyResponse.invoiceable,
          items: [{ economics: unavailable, job }],
        },
        jobsToday: unavailable,
        weeklySchedule: { state: 'HIDDEN' },
      }),
    );
    render(<DashboardPage />);
    expect(yield* Effect.promise(() => screen.findByText('economicsUnavailable'))).toBeTruthy();
    expect(screen.getAllByText(job.description).length).toBeGreaterThan(0);
    expect(screen.getAllByText('sectionUnavailable')).toHaveLength(1);
    expect(screen.queryByText('workforceTitle')).toBeNull();
    expect(screen.getByText('2026-000001')).toBeTruthy();
  }),
);

it.live('renders honest loading and empty states without horizontal table workflow', () =>
  Effect.gen(function* loadingAndEmpty() {
    mocks.executeDashboardOverview.mockReturnValue(Effect.never);
    const pending = render(<DashboardPage />);
    expect(yield* Effect.promise(() => screen.findByText('loading'))).toBeTruthy();
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    pending.unmount();

    mocks.executeDashboardOverview.mockReturnValue(
      Effect.succeed({
        ...readyResponse,
        draftInvoices: { ...readyResponse.draftInvoices, count: { exact: true, value: 0 }, items: [] },
        invoiceable: { ...readyResponse.invoiceable, count: { exact: true, value: 0 }, items: [] },
        issuedInvoices: { ...readyResponse.issuedInvoices, count: { exact: true, value: 0 }, items: [] },
        jobsToday: emptyJobs,
        jobsUpcoming: emptyJobs,
        weeklySchedule: { ...readyResponse.weeklySchedule, items: [] },
      }),
    );
    render(<DashboardPage />);
    expect(yield* Effect.promise(() => screen.findByText('emptyToday'))).toBeTruthy();
    expect(screen.getByText('emptyInvoiceable')).toBeTruthy();
    expect(screen.getByText('emptyWorkforce')).toBeTruthy();
    expect(screen.getByText('emptyDrafts')).toBeTruthy();
    expect(screen.getByText('emptyIssued')).toBeTruthy();
  }),
);

it.live('refreshes on demand, keeps the prior snapshot visible, and disables repeated refresh', () =>
  Effect.gen(function* refreshDashboard() {
    render(<DashboardPage />);
    const refresh = yield* Effect.promise(() => screen.findByRole('button', { name: 'refresh' }));
    mocks.executeDashboardOverview.mockReturnValue(Effect.never);
    fireEvent.click(refresh);
    yield* Effect.promise(() => waitFor(() => expect(mocks.executeDashboardOverview).toHaveBeenCalledTimes(2)));
    expect(screen.getByRole('button', { name: 'refreshing' })).toHaveProperty('disabled', true);
    expect(screen.getByText('2026-000001')).toBeTruthy();
  }),
);

for (const [failure, label] of [
  [
    DashboardOverviewAuthenticationProblemSchema.make({
      detail: 'Failure',
      status: 401,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'authentication',
  ],
  [
    DashboardOverviewForbiddenProblemSchema.make({
      detail: 'Failure',
      status: 403,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'forbidden',
  ],
  [
    DashboardOverviewNotFoundProblemSchema.make({
      detail: 'Failure',
      status: 404,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'notFound',
  ],
  [
    DashboardOverviewUnavailableProblemSchema.make({
      detail: 'Failure',
      retryable: true,
      status: 503,
      title: 'Failure',
      type: 'https://ontos.dev/test',
    }),
    'unavailable',
  ],
] as const) {
  it.live(`maps ${label} without presenting a false empty dashboard`, () =>
    Effect.gen(function* failedDashboard() {
      mocks.executeDashboardOverview.mockReturnValue(Effect.fail(failure));
      render(<DashboardPage />);
      expect(yield* Effect.promise(() => screen.findByText(`error.${label}`))).toBeTruthy();
      expect(screen.queryByText('emptyToday')).toBeNull();
      expect(screen.getByRole('button', { name: 'retry' })).toBeTruthy();
    }),
  );
}
