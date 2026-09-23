import { formClass } from './job-view.ts';
import { JobList } from './job-list.tsx';
import { JobDetail } from './job-detail.tsx';
import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { UltramodernRouteHead } from '../../ultramodern-route-head';
import { useJobsController } from './use-jobs-controller.ts';

const JobsPage = () => {
  const { t } = useModernI18n();
  const label = (key: string) => t(`service-jobs.demo.${key}`);
  const controller = useJobsController();
  const { dispatch, locked, state } = controller;
  const { command, creating, failure, pending, searching, selected, sources } = state;

  return (
    <>
      <UltramodernRouteHead />
      <section
        aria-labelledby="jobs-heading"
        className="servicejobs:mx-auto servicejobs:w-full servicejobs:max-w-5xl servicejobs:px-4 servicejobs:py-6 servicejobs:break-words"
      >
        <header className="servicejobs:mb-6 servicejobs:flex servicejobs:flex-wrap servicejobs:items-center servicejobs:justify-between servicejobs:gap-4">
          <h1 className="servicejobs:text-3xl servicejobs:font-bold" id="jobs-heading">
            {label('title')}
          </h1>
          <Button
            disabled={locked}
            onClick={() => {
              dispatch({ creating: true, failure: null, selected: null });
              controller.search();
            }}
            size="lg"
          >
            {label('new')}
          </Button>
        </header>
        {failure !== null && (
          <div className="servicejobs:mb-4" role="alert">
            <p>{label(`error.${failure.kind}`)}</p>
            {command === null && (
              <Button
                disabled={pending}
                onClick={() => {
                  dispatch({ failure: null });
                  controller.refresh();
                }}
                size="lg"
              >
                {label('refresh')}
              </Button>
            )}
            {command !== null && command.invocationId === undefined && (
              <Button disabled={pending} onClick={() => controller.runCommand(command)} size="lg">
                {label('retry')}
              </Button>
            )}
            {command?.invocationId !== undefined && (
              <Button disabled={pending} onClick={() => controller.recover()} size="lg">
                {label('resolve')}
              </Button>
            )}
          </div>
        )}
        {pending && <output>{label('saving')}</output>}
        {(selected !== null || creating) && (
          <Button
            disabled={locked}
            onClick={() => dispatch({ creating: false, selected: null })}
            size="lg"
            theme="outlined"
          >
            {label('back')}
          </Button>
        )}
        {creating && (
          <div className={formClass}>
            <h2 className="servicejobs:text-xl">{label('acceptedSources')}</h2>
            <p>{label('createHelp')}</p>
            {searching && <output>{label('loading')}</output>}
            {!searching && sources.length === 0 && <p>{label('noSources')}</p>}
            <ul className={formClass}>
              {sources.map((source) => (
                <li key={source.sourceRef.resourceId}>
                  <Button disabled={locked} onClick={() => controller.create(source)} size="lg" theme="outlined">
                    {source.serviceLocation.addressLine}, {source.serviceLocation.city} — {label('create')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!creating && selected === null && <JobList controller={controller} label={label} />}
        {!creating && selected !== null && (
          <JobDetail controller={controller} key={selected.ref.resourceId} label={label} selected={selected} />
        )}
      </section>
    </>
  );
};

export default JobsPage;
