import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import { DateTime, Option } from 'effect';
import { useState } from 'react';
import { UltramodernRouteHead } from '../../ultramodern-route-head';
import { EconomicsSummary } from './economics-summary.tsx';
import { ExpenseForm } from './expense-form.tsx';
import { ExpenseList } from './expense-list.tsx';
import { useJobExpensesController } from './use-job-expenses-controller.ts';
import { cardClass, stackClass } from './job-expenses-view.ts';

const scheduledDateFormatters = {
  cs: new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeStyle: 'short' }),
  en: new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }),
} as const;
const scheduledDateFormatterFor = (language: string) =>
  language.startsWith('cs') ? scheduledDateFormatters.cs : scheduledDateFormatters.en;

interface MutationFeedbackProps {
  readonly controller: ReturnType<typeof useJobExpensesController>;
  readonly label: (key: string) => string;
}

const MutationFeedback = ({ controller, label }: MutationFeedbackProps) => {
  const { state } = controller;
  const handleRecover = () => controller.recover();
  const handleReload = () => controller.reloadAfterConflict();
  const handleRetry = () => controller.retryCommand();
  if (state.mutationFailure === null) {
    return null;
  }
  return (
    <div
      className="jobexpenses:grid jobexpenses:gap-3 jobexpenses:rounded-xl jobexpenses:bg-red-50 jobexpenses:p-4"
      role="alert"
    >
      <p>{label(`error.${state.mutationFailure.kind}`)}</p>
      {state.command?.invocationId === undefined && state.command !== null && (
        <Button disabled={state.pending} onClick={handleRetry} size="lg">
          {label('retry')}
        </Button>
      )}
      {state.command?.invocationId !== undefined && (
        <Button disabled={state.pending} onClick={handleRecover} size="lg">
          {label('resolve')}
        </Button>
      )}
      {state.mutationFailure.kind === 'conflict' && (
        <Button disabled={state.pending} onClick={handleReload} size="lg">
          {label('reload')}
        </Button>
      )}
    </div>
  );
};

export const ExpensesPage = () => {
  const { language, t } = useModernI18n();
  const label = (key: string) => t(`job-expenses.demo.${key}`);
  const controller = useJobExpensesController();
  const { state } = controller;
  const [search, setSearch] = useState('');
  const scheduledDateFormatter = scheduledDateFormatterFor(language);
  const handleLoadMoreJobs = () => controller.loadMoreJobs();
  const headingId = 'expenses-heading';
  const visibleJobs = state.jobs.filter((job) => {
    const needle = search.trim().toLocaleLowerCase();
    return (
      needle === '' ||
      job.serviceScope.description.toLocaleLowerCase().includes(needle) ||
      job.serviceLocation.addressLine.toLocaleLowerCase().includes(needle) ||
      job.serviceLocation.city.toLocaleLowerCase().includes(needle) ||
      job.status.toLocaleLowerCase().includes(needle)
    );
  });
  const feedback = (failure: typeof state.selectionFailure, retry: () => void, key: string) =>
    failure !== null && (
      <div
        className="jobexpenses:grid jobexpenses:gap-3 jobexpenses:rounded-xl jobexpenses:bg-red-50 jobexpenses:p-4"
        role="alert"
      >
        <p>{label(`error.${failure.kind}`)}</p>
        <Button disabled={state.pending} onClick={retry} size="lg" theme="outlined">
          {label(key)}
        </Button>
      </div>
    );

  return (
    <>
      <UltramodernRouteHead />
      <section
        aria-labelledby={headingId}
        className="jobexpenses:mx-auto jobexpenses:w-full jobexpenses:max-w-6xl jobexpenses:min-w-0 jobexpenses:px-4 jobexpenses:py-6 jobexpenses:break-words jobexpenses:sm:px-8"
      >
        <header className="jobexpenses:mb-6">
          <p className="jobexpenses:text-sm jobexpenses:font-semibold jobexpenses:uppercase jobexpenses:tracking-wide jobexpenses:text-um-muted">
            {label('eyebrow')}
          </p>
          <h1
            className="jobexpenses:text-3xl jobexpenses:font-bold jobexpenses:text-(--color-page-fg) jobexpenses:sm:text-4xl"
            id={headingId}
          >
            {label('title')}
          </h1>
          <p className="jobexpenses:mt-2 jobexpenses:max-w-3xl jobexpenses:text-um-muted">{label('intro')}</p>
        </header>
        {state.selectedJob === null ? (
          <div className={stackClass}>
            <FormInput
              id="job-search"
              label={label('jobs.search')}
              onChange={(event) => setSearch(event.currentTarget.value)}
              type="search"
              value={search}
            />
            {feedback(state.selectionFailure, controller.reloadJobs, 'retry')}
            {state.loadingJobs && state.jobs.length === 0 && <output>{label('loading.jobs')}</output>}
            {!state.loadingJobs && visibleJobs.length === 0 && state.selectionFailure === null && (
              <p>{label(search === '' ? 'jobs.empty' : 'jobs.noResults')}</p>
            )}
            <ul className="jobexpenses:grid jobexpenses:gap-4 jobexpenses:md:grid-cols-2">
              {visibleJobs.map((job) => (
                <li className={`${cardClass} jobexpenses:grid jobexpenses:gap-3`} key={job.ref.resourceId}>
                  <div>
                    <h2 className="jobexpenses:text-xl jobexpenses:font-semibold">{job.serviceScope.description}</h2>
                    <p>
                      {job.serviceLocation.addressLine}, {job.serviceLocation.postalCode} {job.serviceLocation.city}
                    </p>
                    <p className="jobexpenses:text-sm jobexpenses:text-um-muted">
                      {label(`jobStatus.${job.status}`)} ·{' '}
                      {Option.match(job.scheduledStartAt, {
                        onNone: () => label('jobs.unscheduled'),
                        onSome: (value) => scheduledDateFormatter.format(DateTime.toDateUtc(value)),
                      })}
                    </p>
                  </div>
                  <Button
                    disabled={state.loadingJobs}
                    onClick={() => controller.dispatch({ selectedJob: job })}
                    size="lg"
                    theme="outlined"
                  >
                    {label('jobs.open')}
                  </Button>
                </li>
              ))}
            </ul>
            {state.jobsCursor !== null && (
              <Button disabled={state.loadingJobs} onClick={handleLoadMoreJobs} size="lg" theme="outlined">
                {label('jobs.loadMore')}
              </Button>
            )}
          </div>
        ) : (
          <div className={stackClass}>
            <Button
              disabled={controller.locked}
              onClick={() =>
                controller.dispatch({
                  economicsFailure: null,
                  editing: null,
                  listFailure: null,
                  mutationFailure: null,
                  selectedJob: null,
                  voiding: null,
                })
              }
              size="lg"
              theme="outlined"
            >
              {label('jobs.back')}
            </Button>
            <section className={cardClass}>
              <h2 className="jobexpenses:text-2xl jobexpenses:font-semibold">
                {state.selectedJob.serviceScope.description}
              </h2>
              <p>
                {state.selectedJob.serviceLocation.addressLine}, {state.selectedJob.serviceLocation.postalCode}{' '}
                {state.selectedJob.serviceLocation.city}
              </p>
              <p>{label(`jobStatus.${state.selectedJob.status}`)}</p>
            </section>
            {state.loadingEconomics && <output>{label('loading.summary')}</output>}
            {feedback(state.economicsFailure, controller.refresh, 'retry')}
            {state.economics !== null && <EconomicsSummary economics={state.economics} label={label} />}
            {feedback(state.listFailure, controller.refresh, 'retry')}
            <MutationFeedback controller={controller} label={label} />
            {state.pending && <output aria-live="polite">{label('saving')}</output>}
            {state.editing !== null && (
              <section className={cardClass}>
                <ExpenseForm
                  disabled={controller.locked}
                  {...(state.editing === 'new' ? {} : { expense: state.editing })}
                  key={state.editing === 'new' ? 'new' : `${state.editing.ref.resourceId}:${state.editing.revision}`}
                  label={label}
                  onCancel={() => controller.dispatch({ editing: null, mutationFailure: null })}
                  onSubmit={(draft) => {
                    if (state.editing === 'new') {
                      controller.record(draft);
                    } else if (state.editing !== null) {
                      controller.update(draft, state.editing);
                    }
                  }}
                  today={state.today}
                />
              </section>
            )}
            <ExpenseList controller={controller} label={label} />
          </div>
        )}
      </section>
    </>
  );
};

export default ExpensesPage;
