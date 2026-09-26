import { Button } from '@techsio/ui-kit/atoms/button';
import type { useJobsController } from './use-jobs-controller.ts';
import { localInput, views } from './job-view.ts';

interface ViewProps {
  readonly controller: ReturnType<typeof useJobsController>;
  readonly label: (key: string) => string;
}
export const JobList = ({ controller, label }: ViewProps) => {
  const { locked, state } = controller;
  const { loading, names, rows } = state;
  const view = state.query.view ?? 'ALL';
  const visible = rows;

  return (
    <>
      <nav
        aria-label={label('filters')}
        className="servicejobs:mb-4 servicejobs:flex servicejobs:flex-wrap servicejobs:gap-2"
      >
        {views.map((value) => (
          <Button
            aria-pressed={view === value}
            disabled={locked}
            key={value}
            onClick={() => controller.dispatch({ loading: true, query: { view: value }, rows: [] })}
            size="lg"
            theme={view === value ? 'solid' : 'outlined'}
          >
            {label(`view.${value}`)}
          </Button>
        ))}
      </nav>
      {loading && <output>{label('loading')}</output>}
      {!loading && visible.length === 0 && <p>{label('empty')}</p>}
      <ul className="servicejobs:grid servicejobs:gap-4 servicejobs:md:grid-cols-2">
        {visible.map((job) => (
          <li
            className="servicejobs:min-w-0 servicejobs:rounded-2xl servicejobs:border servicejobs:border-um-border servicejobs:bg-um-surface servicejobs:flex servicejobs:flex-col servicejobs:gap-2 servicejobs:p-5 servicejobs:shadow-sm"
            key={job.ref.resourceId}
          >
            <p className="servicejobs:mb-2 servicejobs:text-lg servicejobs:font-semibold">
              {names.get(job.partyRef.resourceId) ?? label('contact')}
            </p>
            <p>
              {job.serviceLocation.addressLine}, {job.serviceLocation.city}
            </p>
            <p>{label(`object.${job.serviceScope.objectType}`)}</p>
            <p>{label(`status.${job.status}`)}</p>
            <p>{localInput(job.scheduledStartAt).replace('T', ' ') || label('unscheduled')}</p>
            <Button disabled={locked} onClick={() => controller.open(job.ref.resourceId)} size="lg">
              {label('open')}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
};
