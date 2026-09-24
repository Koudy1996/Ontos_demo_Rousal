import { Link, useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { DateTime } from 'effect';
import type { ReactNode } from 'react';
import type {
  DashboardCount,
  DashboardJob,
  DashboardOverviewResponse,
} from '../../../../shared/apis/dashboard-overview.ts';
import { UltramodernRouteHead } from '../../ultramodern-route-head';
import { useDashboardController } from './use-dashboard-controller.ts';

const card =
  'operationsdashboard:min-w-0 operationsdashboard:rounded-2xl operationsdashboard:border operationsdashboard:border-stone-200 operationsdashboard:bg-white operationsdashboard:p-4 operationsdashboard:shadow-sm';
type OverviewSection = DashboardOverviewResponse[keyof DashboardOverviewResponse];
type StatefulSection = Extract<OverviewSection, { readonly state: string }>;
type CountSection = Extract<StatefulSection, { readonly count: DashboardCount }>;
type InvoiceableReady = Extract<DashboardOverviewResponse['invoiceable'], { readonly state: 'READY' }>;
type DashboardEconomics = InvoiceableReady['items'][number]['economics'];

const countText = (count: DashboardCount) => `${count.value}${count.exact ? '' : '+'}`;
const dateTimeText = (value: string | null, language: string) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        DateTime.toDateUtc(DateTime.makeUnsafe(value)),
      );
const moneyText = (value: string, language: string) =>
  new Intl.NumberFormat(language, { currency: 'CZK', style: 'currency' }).format(Number(value));

const SectionUnavailable = ({ label }: { readonly label: string }) => (
  <output className="operationsdashboard:rounded-xl operationsdashboard:bg-amber-50 operationsdashboard:p-4 operationsdashboard:text-sm operationsdashboard:text-amber-950">
    {label}
  </output>
);

const CountCard = ({
  href,
  label,
  section,
}: {
  readonly href: string;
  readonly label: string;
  readonly section: CountSection | { readonly retryable: true; readonly state: 'UNAVAILABLE' };
}) => (
  <Link
    className={`${card} operationsdashboard:block operationsdashboard:transition hover:operationsdashboard:border-blue-300 focus-visible:operationsdashboard:outline-2 focus-visible:operationsdashboard:outline-offset-2 focus-visible:operationsdashboard:outline-blue-700`}
    to={href}
  >
    <p className="operationsdashboard:text-sm operationsdashboard:font-semibold operationsdashboard:text-stone-600">
      {label}
    </p>
    <p className="operationsdashboard:mt-2 operationsdashboard:text-3xl operationsdashboard:font-black operationsdashboard:text-stone-950">
      {section.state === 'READY' ? countText(section.count) : '—'}
    </p>
  </Link>
);

const SectionHeader = ({
  href,
  label,
  linkLabel,
}: {
  readonly href: string;
  readonly label: string;
  readonly linkLabel: string;
}) => (
  <div className="operationsdashboard:flex operationsdashboard:items-center operationsdashboard:justify-between operationsdashboard:gap-3">
    <h2 className="operationsdashboard:text-xl operationsdashboard:font-bold operationsdashboard:text-stone-950">
      {label}
    </h2>
    <Link
      className="operationsdashboard:min-h-11 operationsdashboard:shrink-0 operationsdashboard:py-3 operationsdashboard:text-sm operationsdashboard:font-bold operationsdashboard:text-blue-700 operationsdashboard:underline-offset-4 hover:operationsdashboard:underline"
      to={href}
    >
      {linkLabel}
    </Link>
  </div>
);

const JobRow = ({
  job,
  language,
  statusLabel,
}: {
  readonly job: DashboardJob;
  readonly language: string;
  readonly statusLabel: string;
}) => (
  <div className="operationsdashboard:grid operationsdashboard:min-w-0 operationsdashboard:gap-1 operationsdashboard:rounded-xl operationsdashboard:border operationsdashboard:border-stone-200 operationsdashboard:p-3">
    <p className="operationsdashboard:font-bold operationsdashboard:text-stone-950">{job.description}</p>
    <p className="operationsdashboard:text-sm operationsdashboard:text-stone-700">
      {job.addressLine}, {job.city}
    </p>
    <p className="operationsdashboard:text-sm operationsdashboard:text-stone-600">
      {dateTimeText(job.scheduledStartAt, language)}
    </p>
    <p className="operationsdashboard:text-xs operationsdashboard:font-bold operationsdashboard:uppercase operationsdashboard:tracking-wide operationsdashboard:text-blue-700">
      {statusLabel}
    </p>
  </div>
);

const JobsPanel = ({
  emptyLabel,
  href,
  language,
  linkLabel,
  section,
  statusLabel,
  title,
  unavailableLabel,
}: {
  readonly emptyLabel: string;
  readonly href: string;
  readonly language: string;
  readonly linkLabel: string;
  readonly section: DashboardOverviewResponse['jobsToday'];
  readonly statusLabel: (status: DashboardJob['status']) => string;
  readonly title: string;
  readonly unavailableLabel: string;
}) => {
  if (section.state === 'HIDDEN') {
    return null;
  }
  let content: ReactNode;
  if (section.state === 'UNAVAILABLE') {
    content = (
      <div className="operationsdashboard:mt-3">
        <SectionUnavailable label={unavailableLabel} />
      </div>
    );
  } else if (section.items.length === 0) {
    content = (
      <p className="operationsdashboard:mt-3 operationsdashboard:text-sm operationsdashboard:text-stone-600">
        {emptyLabel}
      </p>
    );
  } else {
    content = (
      <ul className="operationsdashboard:mt-3 operationsdashboard:grid operationsdashboard:gap-2">
        {section.items.map((job) => (
          <li key={job.id}>
            <JobRow job={job} language={language} statusLabel={statusLabel(job.status)} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className={card}>
      <SectionHeader href={href} label={title} linkLabel={linkLabel} />
      {content}
    </section>
  );
};

const WorkforcePanel = ({
  conflictLabel,
  emptyLabel,
  language,
  linkLabel,
  section,
  statusLabel,
  title,
  unavailableLabel,
}: {
  readonly conflictLabel: string;
  readonly emptyLabel: string;
  readonly language: string;
  readonly linkLabel: string;
  readonly section: DashboardOverviewResponse['weeklySchedule'];
  readonly statusLabel: (status: DashboardJob['status']) => string;
  readonly title: string;
  readonly unavailableLabel: string;
}) => {
  if (section.state === 'HIDDEN') {
    return null;
  }
  let content: ReactNode;
  if (section.state === 'UNAVAILABLE') {
    content = (
      <div className="operationsdashboard:mt-3">
        <SectionUnavailable label={unavailableLabel} />
      </div>
    );
  } else if (section.items.length === 0) {
    content = (
      <p className="operationsdashboard:mt-3 operationsdashboard:text-sm operationsdashboard:text-stone-600">
        {emptyLabel}
      </p>
    );
  } else {
    content = (
      <ul className="operationsdashboard:mt-3 operationsdashboard:grid operationsdashboard:gap-2">
        {section.items.map(({ crew, job }) => (
          <li
            className="operationsdashboard:grid operationsdashboard:gap-2 operationsdashboard:rounded-xl operationsdashboard:border operationsdashboard:border-stone-200 operationsdashboard:p-3"
            key={job.id}
          >
            <JobRow job={job} language={language} statusLabel={statusLabel(job.status)} />
            <p className="operationsdashboard:text-sm operationsdashboard:text-stone-700">
              {crew.length === 0 ? '—' : crew.map(({ displayName }) => displayName).join(', ')}
            </p>
            {crew.some(({ availability }) => availability === 'JOB_CONFLICT') && (
              <output className="operationsdashboard:text-sm operationsdashboard:font-bold operationsdashboard:text-red-700">
                {conflictLabel}
              </output>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className={card}>
      <SectionHeader href="/workforce" label={title} linkLabel={linkLabel} />
      {content}
    </section>
  );
};

const EconomicsSummary = ({
  economics,
  labels,
  language,
  unavailableLabel,
}: {
  readonly economics: DashboardEconomics;
  readonly labels: {
    readonly costs: string;
    readonly difference: string;
    readonly margin: string;
    readonly price: string;
  };
  readonly language: string;
  readonly unavailableLabel: string;
}) => {
  if (economics.state === 'HIDDEN') {
    return null;
  }
  if (economics.state === 'UNAVAILABLE') {
    return <SectionUnavailable label={unavailableLabel} />;
  }
  return (
    <div className="operationsdashboard:grid operationsdashboard:grid-cols-2 operationsdashboard:gap-2 operationsdashboard:text-sm">
      <span className="operationsdashboard:text-stone-600">{labels.price}</span>
      <strong className="operationsdashboard:text-right">{moneyText(economics.agreedPriceCzk, language)}</strong>
      <span className="operationsdashboard:text-stone-600">{labels.costs}</span>
      <strong className="operationsdashboard:text-right">{moneyText(economics.recordedCostTotal, language)}</strong>
      <span className="operationsdashboard:text-stone-600">{labels.difference}</span>
      <strong className="operationsdashboard:text-right">
        {economics.differenceCzk === null ? '—' : moneyText(economics.differenceCzk, language)}
      </strong>
      <span className="operationsdashboard:text-stone-600">{labels.margin}</span>
      <strong className="operationsdashboard:text-right">
        {economics.marginPercent === null ? '—' : `${economics.marginPercent} %`}
      </strong>
    </div>
  );
};

const InvoiceablePanel = ({
  economicsLabels,
  emptyLabel,
  incompleteLabel,
  language,
  linkLabel,
  section,
  title,
  unavailableLabel,
}: {
  readonly economicsLabels: {
    readonly costs: string;
    readonly difference: string;
    readonly margin: string;
    readonly price: string;
  };
  readonly emptyLabel: string;
  readonly incompleteLabel: string;
  readonly language: string;
  readonly linkLabel: string;
  readonly section: DashboardOverviewResponse['invoiceable'];
  readonly title: string;
  readonly unavailableLabel: string;
}) => {
  if (section.state === 'HIDDEN') {
    return null;
  }
  let content: ReactNode;
  if (section.state === 'UNAVAILABLE') {
    content = (
      <div className="operationsdashboard:mt-3">
        <SectionUnavailable label={unavailableLabel} />
      </div>
    );
  } else if (section.items.length === 0) {
    content = (
      <p className="operationsdashboard:mt-3 operationsdashboard:text-sm operationsdashboard:text-stone-600">
        {section.hasMore ? incompleteLabel : emptyLabel}
      </p>
    );
  } else {
    content = (
      <ul className="operationsdashboard:mt-3 operationsdashboard:grid operationsdashboard:gap-2">
        {section.items.map(({ economics, job }) => (
          <li
            className="operationsdashboard:grid operationsdashboard:gap-2 operationsdashboard:rounded-xl operationsdashboard:border operationsdashboard:border-stone-200 operationsdashboard:p-3"
            key={job.id}
          >
            <p className="operationsdashboard:font-bold operationsdashboard:text-stone-950">{job.description}</p>
            <EconomicsSummary
              economics={economics}
              labels={economicsLabels}
              language={language}
              unavailableLabel={unavailableLabel}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className={card}>
      <SectionHeader href="/invoices" label={title} linkLabel={linkLabel} />
      {content}
    </section>
  );
};

const InvoicePanel = ({
  dueAtLabel,
  emptyLabel,
  issuedAtLabel,
  language,
  linkLabel,
  section,
  title,
  unavailableLabel,
}: {
  readonly dueAtLabel: string;
  readonly emptyLabel: string;
  readonly issuedAtLabel: string;
  readonly language: string;
  readonly linkLabel: string;
  readonly section: DashboardOverviewResponse['draftInvoices'];
  readonly title: string;
  readonly unavailableLabel: string;
}) => {
  if (section.state === 'HIDDEN') {
    return null;
  }
  let content: ReactNode;
  if (section.state === 'UNAVAILABLE') {
    content = (
      <div className="operationsdashboard:mt-3">
        <SectionUnavailable label={unavailableLabel} />
      </div>
    );
  } else if (section.items.length === 0) {
    content = (
      <p className="operationsdashboard:mt-3 operationsdashboard:text-sm operationsdashboard:text-stone-600">
        {emptyLabel}
      </p>
    );
  } else {
    content = (
      <ul className="operationsdashboard:mt-3 operationsdashboard:grid operationsdashboard:gap-2">
        {section.items.map((invoice) => (
          <li
            className="operationsdashboard:grid operationsdashboard:gap-1 operationsdashboard:rounded-xl operationsdashboard:border operationsdashboard:border-stone-200 operationsdashboard:p-3"
            key={invoice.id}
          >
            <div className="operationsdashboard:flex operationsdashboard:items-start operationsdashboard:justify-between operationsdashboard:gap-3">
              <p className="operationsdashboard:min-w-0 operationsdashboard:font-bold operationsdashboard:text-stone-950">
                {invoice.customerDisplayName}
              </p>
              <strong className="operationsdashboard:shrink-0">{moneyText(invoice.total, language)}</strong>
            </div>
            <p className="operationsdashboard:text-sm operationsdashboard:text-stone-600">
              {invoice.invoiceNumber ?? invoice.sourceJobDisplayName}
            </p>
            {invoice.status === 'ISSUED' && (
              <dl className="operationsdashboard:mt-1 operationsdashboard:grid operationsdashboard:grid-cols-2 operationsdashboard:gap-1 operationsdashboard:text-sm">
                <dt className="operationsdashboard:text-stone-600">{issuedAtLabel}</dt>
                <dd className="operationsdashboard:text-right">{dateTimeText(invoice.issuedAt, language)}</dd>
                <dt className="operationsdashboard:text-stone-600">{dueAtLabel}</dt>
                <dd className="operationsdashboard:text-right">{dateTimeText(invoice.dueAt, language)}</dd>
              </dl>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className={card}>
      <SectionHeader href="/invoices" label={title} linkLabel={linkLabel} />
      {content}
    </section>
  );
};

const ReadyDashboard = ({
  data,
  label,
  language,
  statusLabel,
}: {
  readonly data: DashboardOverviewResponse;
  readonly label: (key: string) => string;
  readonly language: string;
  readonly statusLabel: (status: DashboardJob['status']) => string;
}) => (
  <>
    <section
      aria-label={label('kpis')}
      className="operationsdashboard:grid operationsdashboard:grid-cols-1 operationsdashboard:gap-3 operationsdashboard:sm:grid-cols-2 operationsdashboard:lg:grid-cols-5"
    >
      {data.inquiries.state === 'HIDDEN' ? null : (
        <CountCard href="/inquiries" label={label('openInquiries')} section={data.inquiries} />
      )}
      {data.jobsToday.state === 'HIDDEN' ? null : (
        <CountCard href="/jobs" label={label('jobsToday')} section={data.jobsToday} />
      )}
      {data.jobsInProgress.state === 'HIDDEN' ? null : (
        <CountCard href="/jobs" label={label('jobsInProgress')} section={data.jobsInProgress} />
      )}
      {data.invoiceable.state === 'HIDDEN' ? null : (
        <CountCard href="/invoices" label={label('invoiceable')} section={data.invoiceable} />
      )}
      {data.draftInvoices.state === 'HIDDEN' ? null : (
        <CountCard href="/invoices" label={label('draftInvoices')} section={data.draftInvoices} />
      )}
    </section>

    <div className="operationsdashboard:grid operationsdashboard:min-w-0 operationsdashboard:gap-5 operationsdashboard:lg:grid-cols-2">
      <JobsPanel
        emptyLabel={label('emptyToday')}
        href="/jobs"
        language={language}
        linkLabel={label('showAll')}
        section={data.jobsToday}
        statusLabel={statusLabel}
        title={label('todayTitle')}
        unavailableLabel={label('sectionUnavailable')}
      />
      <JobsPanel
        emptyLabel={label('emptyUpcoming')}
        href="/jobs"
        language={language}
        linkLabel={label('showAll')}
        section={data.jobsUpcoming}
        statusLabel={statusLabel}
        title={label('upcomingTitle')}
        unavailableLabel={label('sectionUnavailable')}
      />
      <InvoiceablePanel
        economicsLabels={{
          costs: label('economics.costs'),
          difference: label('economics.difference'),
          margin: label('economics.margin'),
          price: label('economics.price'),
        }}
        emptyLabel={label('emptyInvoiceable')}
        incompleteLabel={label('invoiceableIncomplete')}
        language={language}
        linkLabel={label('showAll')}
        section={data.invoiceable}
        title={label('invoiceableTitle')}
        unavailableLabel={label('economicsUnavailable')}
      />
      <WorkforcePanel
        conflictLabel={label('crewConflict')}
        emptyLabel={label('emptyWorkforce')}
        language={language}
        linkLabel={label('showAll')}
        section={data.weeklySchedule}
        statusLabel={statusLabel}
        title={label('workforceTitle')}
        unavailableLabel={label('sectionUnavailable')}
      />
      <InvoicePanel
        dueAtLabel={label('dueAt')}
        emptyLabel={label('emptyDrafts')}
        issuedAtLabel={label('issuedAt')}
        language={language}
        linkLabel={label('showAll')}
        section={data.draftInvoices}
        title={label('draftTitle')}
        unavailableLabel={label('sectionUnavailable')}
      />
      <InvoicePanel
        dueAtLabel={label('dueAt')}
        emptyLabel={label('emptyIssued')}
        issuedAtLabel={label('issuedAt')}
        language={language}
        linkLabel={label('showAll')}
        section={data.issuedInvoices}
        title={label('issuedTitle')}
        unavailableLabel={label('sectionUnavailable')}
      />
    </div>
  </>
);

export const DashboardPage = () => {
  const { language, t } = useModernI18n();
  const controller = useDashboardController();
  const label = (key: string) => t(`operations-dashboard.pages.dashboard.${key}`);
  const statusLabel = (status: DashboardJob['status']) => label(`status.${status}`);
  const { data, error, loading } = controller.state;
  const handleRefresh = controller.refresh;
  const headingId = 'operations-dashboard-heading';
  let dashboardContent: ReactNode;
  if (error !== null) {
    dashboardContent = (
      <section
        className="operationsdashboard:grid operationsdashboard:gap-3 operationsdashboard:rounded-2xl operationsdashboard:bg-red-50 operationsdashboard:p-4 operationsdashboard:text-red-950"
        role="alert"
      >
        <p>{label(`error.${error}`)}</p>
        <Button onClick={handleRefresh}>{label('retry')}</Button>
      </section>
    );
  } else if (data === null) {
    dashboardContent = <output className={card}>{label('loading')}</output>;
  } else {
    dashboardContent = <ReadyDashboard data={data} label={label} language={language} statusLabel={statusLabel} />;
  }

  return (
    <>
      <UltramodernRouteHead />
      <main
        aria-busy={loading}
        aria-labelledby={headingId}
        className="operationsdashboard:mx-auto operationsdashboard:grid operationsdashboard:w-full operationsdashboard:max-w-7xl operationsdashboard:min-w-0 operationsdashboard:gap-5 operationsdashboard:px-4 operationsdashboard:py-6 operationsdashboard:sm:px-6 operationsdashboard:lg:px-8"
      >
        <header className="operationsdashboard:flex operationsdashboard:flex-wrap operationsdashboard:items-center operationsdashboard:justify-between operationsdashboard:gap-3">
          <div>
            <h1
              className="operationsdashboard:text-3xl operationsdashboard:font-black operationsdashboard:text-stone-950"
              id={headingId}
            >
              {label('title')}
            </h1>
            <p className="operationsdashboard:mt-1 operationsdashboard:text-sm operationsdashboard:text-stone-600">
              {label('subtitle')}
            </p>
          </div>
          <Button disabled={loading} onClick={handleRefresh}>
            {loading ? label('refreshing') : label('refresh')}
          </Button>
        </header>

        {dashboardContent}
      </main>
    </>
  );
};

export default DashboardPage;
