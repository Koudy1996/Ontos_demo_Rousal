import {
  executeInvoiceableJobsWithAuthorization,
  executeInvoiceListWithAuthorization,
} from '@app/billing-documents/api/client';
import { ContextAccess, OperationContextUnavailable } from '@app/core-runtime';
import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { executeJobEconomicsWithAuthorization } from '@app/job-expenses/api/client';
import { executeInquiryListWithAuthorization } from '@app/sales-inquiries/api/client';
import { executeJobListWithAuthorization } from '@app/service-jobs/api/client';
import {
  makeDependencyReadGateway,
  withDependencyCredentialRedaction,
} from '@app/shared-contracts/dependency-read-gateway';
import { executeWeeklyScheduleWithAuthorization } from '@app/workforce/api/client';
import { Config, DateTime, Effect, Option, Redacted, Schema } from 'effect';
import type { FetchHttpClient } from 'effect/unstable/http';
import type { DashboardOverviewResponse } from '../../shared/apis/dashboard-overview.ts';
import {
  DashboardDependencyUnavailable,
  DashboardOwnerGatewayCredentialService,
} from '../../shared/domain/dashboard-owner-gateway-credential.ts';
import type { DashboardOwnerAudience } from '../../shared/domain/dashboard-owner-gateway-credential.ts';

const PROVIDER_TIMEOUT = '8 seconds';
const PREVIEW_LIMIT = 5;
const WORKFORCE_PREVIEW_LIMIT = 7;
const MAX_INVOICEABLE_PAGES = 3;
const BILLING_MODULE_ID = 'billing.documents' as const;
const EXPENSES_MODULE_ID = 'job.expenses' as const;
const SALES_MODULE_ID = 'sales.inquiries' as const;
const JOBS_MODULE_ID = 'service.jobs' as const;
const WORKFORCE_MODULE_ID = 'workforce.planning' as const;
const OPEN_INQUIRY_STAGES = ['NEW', 'SITE_VISIT', 'PRICING', 'OFFER_SENT'] as const;
const PROVIDER_MODULES = [
  BILLING_MODULE_ID,
  EXPENSES_MODULE_ID,
  SALES_MODULE_ID,
  JOBS_MODULE_ID,
  WORKFORCE_MODULE_ID,
] as const;
const PermissionDecisionSchema = Schema.Literals(['allowed', 'denied', 'unavailable']);
type PermissionDecision = typeof PermissionDecisionSchema.Type;
type JobListResponse = Effect.Success<ReturnType<typeof executeJobListWithAuthorization>>;
type Job = JobListResponse['items'][number];
type InvoiceListResponse = Effect.Success<ReturnType<typeof executeInvoiceListWithAuthorization>>;
type InvoiceListItem = InvoiceListResponse['items'][number];
type SectionState = { readonly state: 'HIDDEN' } | { readonly retryable: true; readonly state: 'UNAVAILABLE' };
interface InvoiceablePagination {
  readonly cursor: string | null;
  readonly done: boolean;
  readonly hasMore: boolean;
  readonly items: readonly Job[];
}
interface InvoiceableReadyBase {
  readonly count: { readonly exact: boolean; readonly value: number };
  readonly hasMore: boolean;
  readonly items: readonly Job[];
  readonly state: 'READY';
}

const hidden = (): SectionState => ({ state: 'HIDDEN' });
const unavailable = (cause?: unknown): SectionState =>
  cause === undefined
    ? { retryable: true, state: 'UNAVAILABLE' }
    : Object.defineProperty<SectionState>({ retryable: true, state: 'UNAVAILABLE' }, 'cause', {
        enumerable: false,
        value: cause,
      });
const dependencyUnavailable = (reason: string, cause?: unknown) =>
  Object.defineProperty(new DashboardDependencyUnavailable({ reason }), 'cause', {
    enumerable: false,
    value: cause,
  });

const ownerUrlSchema = (requiredPath: string) =>
  Schema.URLFromString.check(
    Schema.makeFilter((url) =>
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === requiredPath &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
        ? undefined
        : `Owner URL must use HTTP(S), path ${requiredPath}, and no credentials, query, or fragment`,
    ),
  );

const ownerUrl = (environmentName: string, requiredPath: string) =>
  Config.schema(ownerUrlSchema(requiredPath), environmentName).pipe(
    Effect.map((url) => url.toString().replace(/\/$/u, '')),
    Effect.mapError((cause) => dependencyUnavailable(`${environmentName} is unavailable`, cause)),
  );

const iso = (value: DateTime.Utc): string => DateTime.formatIso(value);
const optionalIso = (value: Option.Option<DateTime.Utc>): string | null =>
  Option.match(value, { onNone: () => null, onSome: iso });
const optionalString = (value: Option.Option<string>): string | null =>
  Option.match(value, { onNone: () => null, onSome: (item) => item });
const pragueDayFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Prague',
  year: 'numeric',
});

export const pragueWeekStart = (now: DateTime.Utc): string => {
  const day = pragueDayFormatter.format(DateTime.toDateUtc(now));
  const date = DateTime.makeUnsafe(`${day}T00:00:00Z`);
  const daysSinceMonday = (DateTime.toDateUtc(date).getUTCDay() + 6) % 7;
  return DateTime.formatIsoDateUtc(DateTime.subtract(date, { days: daysSinceMonday }));
};

const mapJob = (job: Job) => ({
  addressLine: job.serviceLocation.addressLine,
  city: job.serviceLocation.city,
  description: job.serviceScope.description,
  id: job.ref.resourceId,
  scheduledStartAt: optionalIso(job.scheduledStartAt),
  status: job.status,
});

const mapInvoice = ({ customerDisplayName, invoice, sourceJobDisplayName }: InvoiceListItem) => ({
  currency: invoice.commercialSnapshot.currency,
  customerDisplayName,
  dueAt: invoice.dueAt === null ? null : iso(invoice.dueAt),
  id: invoice.ref.resourceId,
  invoiceNumber: invoice.invoiceNumber,
  issuedAt: invoice.issuedAt === null ? null : iso(invoice.issuedAt),
  sourceJobDisplayName,
  status: invoice.status,
  total: invoice.commercialSnapshot.total,
});

const assertJobScope = (job: Job, scope: OperationalScope) =>
  job.ref.tenantId === scope.tenantId && job.legalEntityId === scope.legalEntityId
    ? Effect.void
    : Effect.fail(dependencyUnavailable('Owner returned a Job outside the dashboard scope'));

const assertInvoiceScope = (item: InvoiceListItem, scope: OperationalScope) =>
  item.invoice.ref.tenantId === scope.tenantId &&
  item.invoice.sourceJobRef.tenantId === scope.tenantId &&
  item.invoice.legalEntityId === scope.legalEntityId
    ? Effect.void
    : Effect.fail(dependencyUnavailable('Owner returned an Invoice outside the dashboard scope'));

const settleSection = <Value, Failure, Requirements>(
  decision: PermissionDecision,
  load: Effect.Effect<Value, Failure, Requirements>,
) => {
  if (decision === 'denied') {
    return Effect.succeed(hidden());
  }
  if (decision === 'unavailable') {
    return Effect.succeed(unavailable());
  }
  return load.pipe(
    Effect.timeout(PROVIDER_TIMEOUT),
    Effect.match({ onFailure: (cause) => unavailable(cause), onSuccess: (value) => value }),
  );
};

export interface DashboardOverviewServices {
  readonly load: Effect.Effect<DashboardOverviewResponse, never, FetchHttpClient.RequestInit>;
}

export const makeDashboardOverviewService = Effect.fn('OperationsDashboard.services')(function* makeServices(
  scope: OperationalScope,
) {
  if (scope.legalEntityId === undefined) {
    return yield* new OperationContextUnavailable({
      code: 'operation_context_unavailable',
      reason: 'A current Legal Entity is required',
    });
  }
  const { legalEntityId } = scope;
  const contextAccess = yield* ContextAccess;
  const credentials = yield* DashboardOwnerGatewayCredentialService;
  const decisions = yield* contextAccess.modules({
    legalEntityId,
    moduleIds: PROVIDER_MODULES,
    principalId: scope.principalId,
    tenantId: scope.tenantId,
  });
  const decisionByModule = new Map(decisions.map((item) => [item.key, item.decision]));
  const decision = (moduleId: (typeof PROVIDER_MODULES)[number]): PermissionDecision =>
    decisionByModule.get(moduleId) ?? 'unavailable';

  const ownerCall = <Value, Failure, Requirements>(
    audience: DashboardOwnerAudience,
    environmentName: string,
    requiredPath: string,
    run: (authorization: Redacted.Redacted, baseUrl: string) => Effect.Effect<Value, Failure, Requirements>,
    dependencyPath?: '/reads/job-economics' | '/reads/weekly-schedule',
  ) =>
    Effect.gen(function* executeOwnerCall() {
      const [authorization, baseUrl] = yield* Effect.all(
        [
          credentials.issue({ audience, legalEntityId, requestCorrelation: scope.correlationId }),
          ownerUrl(environmentName, requiredPath),
        ],
        { concurrency: 2 },
      );
      const attempt = run(Redacted.make(`Bearer ${Redacted.value(authorization).token}`), baseUrl);
      // These owners verify a separate, single-use Service Jobs assertion for their nested read.
      const authorizedAttempt =
        dependencyPath === undefined
          ? attempt
          : makeDependencyReadGateway(
              {
                audience: 'service-jobs',
                ownerApiPrefix: requiredPath,
                ownerBaseUrl: () => baseUrl,
                paths: [dependencyPath],
              },
              ({ audience: dependencyAudience }) =>
                credentials
                  .issue({ audience: dependencyAudience, legalEntityId, requestCorrelation: scope.correlationId })
                  .pipe(Effect.map(Redacted.value)),
            ).invoke(attempt);
      return yield* authorizedAttempt.pipe(
        Effect.mapError((cause) => dependencyUnavailable(`${audience} owner read failed`, cause)),
      );
    }).pipe(withDependencyCredentialRedaction);

  const loadInquiries = Effect.gen(function* loadOpenInquiries() {
    const stages = yield* Effect.forEach(
      OPEN_INQUIRY_STAGES,
      (stage) =>
        ownerCall(
          'sales-inquiries',
          'ONTOS_SALES_INQUIRIES_API_URL',
          '/sales-inquiries-api',
          (authorization, baseUrl) =>
            executeInquiryListWithAuthorization({ stage }, Redacted.value(authorization), scope.correlationId, {
              baseUrl,
            }),
        ),
      { concurrency: 4 },
    );
    const items = stages.flatMap((stage) => stage.items);
    if (items.some((inquiry) => inquiry.ref.tenantId !== scope.tenantId || inquiry.legalEntityId !== legalEntityId)) {
      return yield* dependencyUnavailable('Owner returned an Inquiry outside the dashboard scope');
    }
    return {
      count: { exact: stages.every((stage) => stage.items.length < 100), value: items.length },
      state: 'READY' as const,
    };
  });

  const loadJobs = Effect.fn('OperationsDashboard.loadJobs')(function* loadJobView(
    view: 'TODAY' | 'IN_PROGRESS' | 'UPCOMING',
  ) {
    const result = yield* ownerCall(
      'service-jobs',
      'ONTOS_SERVICE_JOBS_API_URL',
      '/service-jobs-api',
      (authorization, baseUrl) =>
        executeJobListWithAuthorization({ pageSize: 100, view }, Redacted.value(authorization), scope.correlationId, {
          baseUrl,
        }),
    );
    yield* Effect.forEach(result.items, (job) => assertJobScope(job, scope), { concurrency: 1, discard: true });
    const hasMore = result.nextCursor !== null;
    return {
      count: { exact: !hasMore, value: result.items.length },
      hasMore,
      items: result.items.slice(0, PREVIEW_LIMIT).map(mapJob),
      state: 'READY' as const,
    };
  });

  const loadWeeklySchedule = Effect.gen(function* loadCurrentWeek() {
    const weekStart = pragueWeekStart(yield* DateTime.now);
    const result = yield* ownerCall(
      'workforce',
      'ONTOS_WORKFORCE_API_URL',
      '/workforce-api',
      (authorization, baseUrl) =>
        executeWeeklyScheduleWithAuthorization({ weekStart }, Redacted.value(authorization), scope.correlationId, {
          baseUrl,
        }),
      '/reads/weekly-schedule',
    );
    yield* Effect.forEach(
      result.items,
      ({ crew, job }) =>
        Effect.all(
          [
            assertJobScope(job, scope),
            Effect.forEach(
              crew,
              ({ worker }) =>
                worker.ref.tenantId === scope.tenantId && worker.legalEntityId === legalEntityId
                  ? Effect.void
                  : Effect.fail(dependencyUnavailable('Owner returned a Worker outside the dashboard scope')),
              { concurrency: 1, discard: true },
            ),
          ],
          { concurrency: 2, discard: true },
        ),
      { concurrency: 1, discard: true },
    );
    return {
      items: result.items.slice(0, WORKFORCE_PREVIEW_LIMIT).map(({ crew, job }) => ({
        crew: crew.map(({ availability, worker }) => ({
          availability: availability.state,
          displayName: worker.displayName,
          position: optionalString(worker.position),
        })),
        job: mapJob(job),
      })),
      state: 'READY' as const,
      weekStart,
    };
  });

  const loadEconomics = Effect.fn('OperationsDashboard.loadEconomics')(function* loadJobEconomics(job: Job) {
    return yield* settleSection(
      decision(EXPENSES_MODULE_ID),
      Effect.gen(function* readEconomics() {
        const result = yield* ownerCall(
          'job-expenses',
          'ONTOS_JOB_EXPENSES_API_URL',
          '/job-expenses-api',
          (authorization, baseUrl) =>
            executeJobEconomicsWithAuthorization(
              { serviceJobRef: job.ref },
              Redacted.value(authorization),
              scope.correlationId,
              { baseUrl },
            ),
          '/reads/job-economics',
        );
        if (
          result.serviceJobRef.tenantId !== scope.tenantId ||
          result.serviceJobRef.resourceId !== job.ref.resourceId
        ) {
          return yield* dependencyUnavailable('Owner returned Job economics outside the dashboard scope');
        }
        return {
          agreedPriceCzk: result.agreedPriceCzk,
          comparisonReason: result.comparisonReason,
          currency: result.currency,
          differenceCzk: result.differenceCzk,
          marginPercent: result.marginPercent,
          recordedCostTotal: result.recordedCostTotal,
          state: 'READY' as const,
        };
      }),
    );
  });

  const readInvoiceablePage = Effect.fn('OperationsDashboard.readInvoiceablePage')(function* readInvoiceablePage(
    cursor: string | null,
  ) {
    const payload = cursor === null ? { pageSize: 100 } : { cursor, pageSize: 100 };
    const result = yield* ownerCall(
      'billing-documents',
      'ONTOS_BILLING_DOCUMENTS_API_URL',
      '/billing-documents-api',
      (authorization, baseUrl) =>
        executeInvoiceableJobsWithAuthorization(payload, Redacted.value(authorization), scope.correlationId, {
          baseUrl,
        }),
    );
    yield* Effect.forEach(result.items, (item) => assertJobScope(item, scope), {
      concurrency: 1,
      discard: true,
    });
    return result;
  });

  const accumulateInvoiceablePage = Effect.fn('OperationsDashboard.accumulateInvoiceablePage')(
    function* accumulateInvoiceablePage(state: InvoiceablePagination) {
      if (state.done) {
        return state;
      }
      const result = yield* readInvoiceablePage(state.cursor);
      return {
        cursor: result.nextCursor,
        done: result.nextCursor === null,
        hasMore: result.nextCursor !== null,
        items: [...state.items, ...result.items],
      } satisfies InvoiceablePagination;
    },
  );

  const loadInvoiceableJobs = Effect.gen(function* loadInvoiceableJobs() {
    const pagination = yield* Effect.reduce(
      Array.from({ length: MAX_INVOICEABLE_PAGES }),
      (): InvoiceablePagination => ({ cursor: null, done: false, hasMore: false, items: [] }),
      (state) => accumulateInvoiceablePage(state),
    );
    return {
      count: { exact: !pagination.hasMore, value: pagination.items.length },
      hasMore: pagination.hasMore,
      items: pagination.items.slice(0, PREVIEW_LIMIT),
      state: 'READY' as const,
    } satisfies InvoiceableReadyBase;
  });

  const loadInvoiceable: Effect.Effect<DashboardOverviewResponse['invoiceable'], never, FetchHttpClient.RequestInit> =
    Effect.gen(function* loadInvoiceableSection() {
      const section = yield* settleSection(decision(BILLING_MODULE_ID), loadInvoiceableJobs);
      if (section.state !== 'READY') {
        return section;
      }
      const economics = yield* Effect.forEach(section.items, loadEconomics, { concurrency: PREVIEW_LIMIT });
      return {
        ...section,
        items: section.items.map((job, index) => ({
          economics: economics[index] ?? unavailable(),
          job: mapJob(job),
        })),
      };
    });

  const loadInvoices = Effect.fn('OperationsDashboard.loadInvoices')(function* loadInvoiceStatus(
    status: 'DRAFT' | 'ISSUED',
  ) {
    const result = yield* ownerCall(
      'billing-documents',
      'ONTOS_BILLING_DOCUMENTS_API_URL',
      '/billing-documents-api',
      (authorization, baseUrl) =>
        executeInvoiceListWithAuthorization(
          { pageSize: 100, status },
          Redacted.value(authorization),
          scope.correlationId,
          { baseUrl },
        ),
    );
    yield* Effect.forEach(result.items, (item) => assertInvoiceScope(item, scope), {
      concurrency: 1,
      discard: true,
    });
    const hasMore = result.nextCursor !== null;
    return {
      count: { exact: !hasMore, value: result.items.length },
      hasMore,
      items: result.items.slice(0, PREVIEW_LIMIT).map(mapInvoice),
      state: 'READY' as const,
    };
  });

  return {
    load: Effect.gen(function* loadDashboard() {
      const [
        inquiries,
        jobsToday,
        jobsInProgress,
        jobsUpcoming,
        weeklySchedule,
        invoiceable,
        draftInvoices,
        issuedInvoices,
      ] = yield* Effect.all(
        [
          settleSection(decision(SALES_MODULE_ID), loadInquiries),
          settleSection(decision(JOBS_MODULE_ID), loadJobs('TODAY')),
          settleSection(decision(JOBS_MODULE_ID), loadJobs('IN_PROGRESS')),
          settleSection(decision(JOBS_MODULE_ID), loadJobs('UPCOMING')),
          settleSection(decision(WORKFORCE_MODULE_ID), loadWeeklySchedule),
          loadInvoiceable,
          settleSection(decision(BILLING_MODULE_ID), loadInvoices('DRAFT')),
          settleSection(decision(BILLING_MODULE_ID), loadInvoices('ISSUED')),
        ],
        { concurrency: 8 },
      );
      return {
        draftInvoices,
        generatedAt: DateTime.formatIso(yield* DateTime.now),
        inquiries,
        invoiceable,
        issuedInvoices,
        jobsInProgress,
        jobsToday,
        jobsUpcoming,
        weeklySchedule,
      } satisfies DashboardOverviewResponse;
    }),
  } satisfies DashboardOverviewServices;
});

export const dashboardOverviewService: ReadServiceFactory<
  DashboardOverviewServices,
  ContextAccess | DashboardOwnerGatewayCredentialService | FetchHttpClient.RequestInit
> = (_transaction, scope) => makeDashboardOverviewService(scope);
