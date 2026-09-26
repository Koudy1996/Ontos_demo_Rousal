import { WorkforceFeedback } from './workforce-feedback.tsx';
import { useState } from 'react';
import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import { UltramodernRouteHead } from '../../ultramodern-route-head';
import { useWorkforceController } from './use-workforce-controller.ts';
import { WorkerForm } from './worker-form.tsx';
import { WorkerDetail } from './worker-detail.tsx';
import { WeeklySchedule } from './weekly-schedule.tsx';
import { createWorkerCommand } from './workforce-commands.ts';
import { cardClass, stackClass } from './workforce-view.ts';

const WorkforcePage = () => {
  const { t } = useModernI18n();
  const label = (key: string) => t(`workforce.demo.${key}`);
  const controller = useWorkforceController();
  const { dispatch, locked, state } = controller;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const visible = state.workers.filter(
    (worker) =>
      (status === 'ALL' || worker.status === status) &&
      worker.displayName.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const showDetail = state.selectedId !== null || state.creating;
  return (
    <>
      <UltramodernRouteHead />
      <section
        aria-labelledby="workforce-heading"
        className="workforce:mx-auto workforce:w-full workforce:max-w-5xl workforce:min-w-0 workforce:px-4 workforce:py-6 workforce:break-words"
      >
        <header className="workforce:mb-6 workforce:flex workforce:flex-wrap workforce:items-center workforce:justify-between workforce:gap-4">
          <h1 className="workforce:text-3xl workforce:font-bold" id="workforce-heading">
            {label('title')}
          </h1>
          <Button
            disabled={locked}
            onClick={() => dispatch({ creating: true, failure: null, selectedId: null })}
            size="lg"
          >
            {label('newWorker')}
          </Button>
        </header>
        <nav
          aria-label={label('perspectives')}
          className="workforce:mb-6 workforce:flex workforce:flex-wrap workforce:gap-3"
        >
          {(['workers', 'schedule'] as const).map((view) => (
            <Button
              aria-pressed={state.view === view}
              disabled={locked}
              key={view}
              onClick={() => dispatch({ creating: false, failure: null, jobRef: null, selectedId: null, view })}
              size="lg"
              theme={state.view === view ? 'solid' : 'outlined'}
            >
              {label(view)}
            </Button>
          ))}
        </nav>
        <WorkforceFeedback controller={controller} label={label} />
        {state.pending && <output>{label('saving')}</output>}
        {showDetail && (
          <Button
            disabled={locked}
            onClick={() => dispatch({ creating: false, failure: null, selectedId: null })}
            size="lg"
            theme="outlined"
          >
            {label('back')}
          </Button>
        )}
        {state.creating && (
          <WorkerForm
            disabled={locked}
            label={label}
            submit={(input) => controller.submit((key) => createWorkerCommand(input, key), true)}
          />
        )}
        {state.loadingDetail && <output>{label('loading')}</output>}
        {state.detail !== null && state.selectedId !== null && !state.creating && (
          <WorkerDetail controller={controller} detail={state.detail} label={label} today={state.today} />
        )}
        {!showDetail && state.view === 'schedule' && <WeeklySchedule controller={controller} label={label} />}
        {!showDetail && state.view === 'workers' && (
          <div className={stackClass}>
            <FormInput
              id="worker-search"
              label={label('search')}
              onChange={(event) => setSearch(event.currentTarget.value)}
              type="search"
              value={search}
            />
            <div className="workforce:flex workforce:flex-wrap workforce:gap-3">
              {['ACTIVE', 'INACTIVE', 'ALL'].map((value) => (
                <Button
                  aria-pressed={status === value}
                  key={value}
                  onClick={() => setStatus(value)}
                  size="lg"
                  theme="outlined"
                >
                  {label(`status.${value}`)}
                </Button>
              ))}
            </div>
            {state.loading && <output>{label('loading')}</output>}
            {!state.loading && visible.length === 0 && state.failure === null && (
              <p>{label(search === '' ? 'noWorkers' : 'noResults')}</p>
            )}
            <ul className="workforce:grid workforce:gap-4 workforce:sm:grid-cols-2">
              {visible.map((worker) => (
                <li className={cardClass} key={worker.ref.resourceId}>
                  <h2 className="workforce:text-xl workforce:font-semibold">{worker.displayName}</h2>
                  <p>
                    {label(`status.${worker.status}`)} · {label(`agreementType.${worker.agreementType}`)}
                  </p>
                  <Button
                    disabled={locked}
                    onClick={() => dispatch({ failure: null, selectedId: worker.ref.resourceId })}
                    size="lg"
                    theme="outlined"
                  >
                    {label('open')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
};
export default WorkforcePage;
