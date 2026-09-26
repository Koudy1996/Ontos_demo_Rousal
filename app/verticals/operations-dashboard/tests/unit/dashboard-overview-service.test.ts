import { ContextAccess } from '@app/core-runtime';
import type { executeJobListWithAuthorization } from '@app/service-jobs/api/client';
import {
  attachDependencyReadCredential,
  DEPENDENCY_READ_AUTHORIZATION_HEADER,
} from '@app/shared-contracts/dependency-read-gateway';
import { ConfigProvider, DateTime, Effect, Fiber, Option, Redacted, Result, Schema } from 'effect';
import { FetchHttpClient, HttpClientRequest } from 'effect/unstable/http';
import { beforeEach, expect, it, rstest } from 'effect-rstest';
import { TestClock } from 'effect/testing';
import { DashboardOwnerGatewayCredentialService } from '../../shared/domain/dashboard-owner-gateway-credential.ts';
import { makeDashboardOverviewService } from '../../src/services/dashboard-overview.service.ts';

const mocks = rstest.hoisted(() => ({
  executeInquiryList: rstest.fn(),
  executeInvoiceableJobs: rstest.fn(),
  executeInvoiceList: rstest.fn(),
  executeJobEconomics: rstest.fn(),
  executeJobList: rstest.fn(),
  executeWeeklySchedule: rstest.fn(),
}));

rstest.mock('@app/sales-inquiries/api/client', () => ({
  executeInquiryListWithAuthorization: mocks.executeInquiryList,
}));
rstest.mock('@app/service-jobs/api/client', () => ({ executeJobListWithAuthorization: mocks.executeJobList }));
rstest.mock('@app/workforce/api/client', () => ({
  executeWeeklyScheduleWithAuthorization: mocks.executeWeeklySchedule,
}));
rstest.mock('@app/billing-documents/api/client', () => ({
  executeInvoiceableJobsWithAuthorization: mocks.executeInvoiceableJobs,
  executeInvoiceListWithAuthorization: mocks.executeInvoiceList,
}));
rstest.mock('@app/job-expenses/api/client', () => ({
  executeJobEconomicsWithAuthorization: mocks.executeJobEconomics,
}));

const tenantId = '70000000-0000-4000-8000-000000000010';
const legalEntityId = '71000000-0000-4000-8000-000000000010';
const scope = {
  authMethod: 'session',
  correlationId: 'dashboard-service-test',
  legalEntityId,
  principalId: '72000000-0000-4000-8000-000000000010',
  tenantId,
} as const;
const urls = ConfigProvider.fromUnknown({
  ONTOS_BILLING_DOCUMENTS_API_URL: 'http://billing.test/billing-documents-api',
  ONTOS_JOB_EXPENSES_API_URL: 'http://expenses.test/job-expenses-api',
  ONTOS_SALES_INQUIRIES_API_URL: 'http://sales.test/sales-inquiries-api',
  ONTOS_SERVICE_JOBS_API_URL: 'http://jobs.test/service-jobs-api',
  ONTOS_WORKFORCE_API_URL: 'http://workforce.test/workforce-api',
});
const job = {
  legalEntityId,
  ref: { resourceId: 'job-1', tenantId },
  scheduledStartAt: Option.some(DateTime.makeUnsafe('2026-09-25T08:00:00.000Z')),
  serviceLocation: { addressLine: 'Dlouhá 12', city: 'Praha' },
  serviceScope: { description: 'Vyklizení bytu 2+1' },
  status: 'COMPLETED',
} as const;

const ModuleDecisionSchema = Schema.Literals(['allowed', 'denied', 'unavailable']);
type ModuleDecision = typeof ModuleDecisionSchema.Type;
const dashboard = (overrides: Readonly<Partial<Record<string, ModuleDecision>>> = {}) => {
  const issuedAudiences: string[] = [];
  const effect = makeDashboardOverviewService(scope).pipe(
    Effect.flatMap((service) => service.load),
    Effect.provideService(ContextAccess, {
      businessPermissions: () => Effect.succeed([]),
      legalEntities: () => Effect.succeed([]),
      modules: ({ moduleIds }) =>
        Effect.succeed(moduleIds.map((key) => ({ decision: overrides[key] ?? 'allowed', key }))),
      resources: () => Effect.succeed([]),
      tenants: () => Effect.succeed([]),
    }),
    Effect.provideService(DashboardOwnerGatewayCredentialService, {
      issue: ({ audience }) => {
        issuedAudiences.push(audience);
        return Effect.succeed(
          Redacted.make({ expiresAt: 1_800_000_000, token: `${audience}-${issuedAudiences.length}` }),
        );
      },
    }),
    Effect.provideService(ConfigProvider.ConfigProvider, urls),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'error' }),
  );
  return { effect, issuedAudiences };
};

beforeEach(() => {
  rstest.clearAllMocks();
  mocks.executeInquiryList.mockReturnValue(Effect.succeed({ items: [] }));
  mocks.executeJobList.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
  mocks.executeWeeklySchedule.mockReturnValue(Effect.succeed({ items: [] }));
  mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
  mocks.executeInvoiceList.mockReturnValue(Effect.succeed({ items: [], nextCursor: null }));
  mocks.executeJobEconomics.mockReturnValue(
    Effect.succeed({
      agreedPriceCzk: '20000.00',
      comparisonReason: null,
      currency: 'CZK',
      differenceCzk: '5000.00',
      marginPercent: '25.00',
      recordedCostTotal: '15000.00',
      serviceJobRef: job.ref,
    }),
  );
});

it.effect('uses a fresh bounded assertion per owner call and marks capped inquiry totals as lower bounds', () =>
  Effect.gen(function* freshAssertions() {
    mocks.executeInquiryList.mockReturnValue(
      Effect.succeed({
        items: Array.from({ length: 100 }, (_, index) => ({
          legalEntityId,
          ref: { resourceId: `inquiry-${index}`, tenantId },
        })),
      }),
    );
    const fixture = dashboard();
    const result = yield* fixture.effect;
    expect(result.inquiries).toEqual({ count: { exact: false, value: 400 }, state: 'READY' });
    expect(mocks.executeInquiryList).toHaveBeenCalledTimes(4);
    expect(new Set(fixture.issuedAudiences)).toEqual(
      new Set(['billing-documents', 'sales-inquiries', 'service-jobs', 'workforce']),
    );
    expect(fixture.issuedAudiences).toHaveLength(12);
  }),
);

it.effect('does not call a denied owner and reports its dashboard sections as hidden', () =>
  Effect.gen(function* deniedOwner() {
    const result = yield* dashboard({ 'billing.documents': 'denied' }).effect;
    expect(result.invoiceable).toEqual({ state: 'HIDDEN' });
    expect(result.draftInvoices).toEqual({ state: 'HIDDEN' });
    expect(result.issuedInvoices).toEqual({ state: 'HIDDEN' });
    expect(mocks.executeInvoiceableJobs).not.toHaveBeenCalled();
    expect(mocks.executeInvoiceList).not.toHaveBeenCalled();
  }),
);

it.effect('continues bounded invoiceable paging when a filtered page is empty', () =>
  Effect.gen(function* filteredPage() {
    mocks.executeInvoiceableJobs
      .mockReturnValueOnce(Effect.succeed({ items: [], nextCursor: 'cursor-2' }))
      .mockReturnValueOnce(Effect.succeed({ items: [job], nextCursor: null }));
    const result = yield* dashboard().effect;
    expect(mocks.executeInvoiceableJobs).toHaveBeenCalledTimes(2);
    expect(result.invoiceable.state).toBe('READY');
    if (result.invoiceable.state === 'READY') {
      expect(result.invoiceable.count).toEqual({ exact: true, value: 1 });
      expect(result.invoiceable.items[0]?.job.id).toBe('job-1');
      expect(result.invoiceable.items[0]?.economics.state).toBe('READY');
    }
  }),
);

it.effect('keeps an invoiceable job visible when its economics owner is unavailable', () =>
  Effect.gen(function* partialEconomics() {
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [job], nextCursor: null }));
    const result = yield* dashboard({ 'job.expenses': 'unavailable' }).effect;
    expect(mocks.executeJobEconomics).not.toHaveBeenCalled();
    if (result.invoiceable.state === 'READY') {
      expect(result.invoiceable.items[0]?.job.id).toBe('job-1');
      expect(result.invoiceable.items[0]?.economics).toEqual({ retryable: true, state: 'UNAVAILABLE' });
    } else {
      expect(result.invoiceable.state).toBe('READY');
    }
  }),
);

it.effect('supplies a fresh single-use Jobs dependency assertion to each economics request', () =>
  Effect.gen(function* economicsDependency() {
    const dependencyHeaders: string[] = [];
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [job, job], nextCursor: null }));
    mocks.executeJobEconomics.mockReturnValue(
      Effect.gen(function* readEconomicsWithDependency() {
        const request = HttpClientRequest.post('/reads/job-economics');
        const attach = attachDependencyReadCredential(
          '/job-expenses-api',
          request,
          'http://expenses.test/job-expenses-api',
        );
        const authorized = yield* attach;
        const header = authorized.headers[DEPENDENCY_READ_AUTHORIZATION_HEADER];
        expect(header).toMatch(/^Bearer service-jobs-/u);
        dependencyHeaders.push(header ?? 'missing');
        expect(Result.isFailure(yield* attach.pipe(Effect.result))).toBe(true);
        return {
          agreedPriceCzk: '20000.00',
          comparisonReason: null,
          currency: 'CZK',
          differenceCzk: '5000.00',
          marginPercent: '25.00',
          recordedCostTotal: '15000.00',
          serviceJobRef: job.ref,
        };
      }),
    );
    const result = yield* dashboard().effect;
    expect(dependencyHeaders).toHaveLength(2);
    expect(new Set(dependencyHeaders).size).toBe(2);
    expect(result.invoiceable.state).toBe('READY');
    if (result.invoiceable.state === 'READY') {
      expect(result.invoiceable.items.map(({ economics }) => economics.state)).toEqual(['READY', 'READY']);
    }
  }),
);

it.effect('supplies the Jobs dependency assertion to the weekly schedule owner', () =>
  Effect.gen(function* scheduleDependency() {
    mocks.executeWeeklySchedule.mockReturnValue(
      Effect.gen(function* readScheduleWithDependency() {
        const request = yield* attachDependencyReadCredential(
          '/workforce-api',
          HttpClientRequest.post('/reads/weekly-schedule'),
          'http://workforce.test/workforce-api',
        );
        expect(request.headers[DEPENDENCY_READ_AUTHORIZATION_HEADER]).toMatch(/^Bearer service-jobs-/u);
        return { items: [] };
      }),
    );
    const result = yield* dashboard().effect;
    expect(result.weeklySchedule.state).toBe('READY');
  }),
);

it.effect('keeps Billing results visible when the economics owner times out', () =>
  Effect.gen(function* timedOutEconomics() {
    mocks.executeInvoiceableJobs.mockReturnValue(Effect.succeed({ items: [job], nextCursor: null }));
    mocks.executeJobEconomics.mockReturnValue(Effect.never);
    const fiber = yield* dashboard().effect.pipe(Effect.forkChild);
    yield* Effect.yieldNow;
    yield* TestClock.adjust('9 seconds');
    const result = yield* Fiber.join(fiber);
    expect(result.invoiceable.state).toBe('READY');
    if (result.invoiceable.state === 'READY') {
      expect(result.invoiceable.items[0]?.job.id).toBe('job-1');
      expect(result.invoiceable.items[0]?.economics).toEqual({ retryable: true, state: 'UNAVAILABLE' });
    }
  }),
);

it.effect('fails a cross-scope owner result closed for only the affected section', () =>
  Effect.gen(function* crossScope() {
    mocks.executeJobList.mockImplementation((input: Parameters<typeof executeJobListWithAuthorization>[0]) =>
      Effect.succeed({
        items: input.view === 'TODAY' ? [{ ...job, legalEntityId: 'foreign-legal-entity' }] : [],
        nextCursor: null,
      }),
    );
    const result = yield* dashboard().effect;
    expect(result.jobsToday).toEqual({ retryable: true, state: 'UNAVAILABLE' });
    expect(result.jobsInProgress.state).toBe('READY');
    expect(result.draftInvoices.state).toBe('READY');
  }),
);
