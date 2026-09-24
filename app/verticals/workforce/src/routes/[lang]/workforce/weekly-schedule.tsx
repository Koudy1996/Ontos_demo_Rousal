import { CrewSelector } from './crew-selector.tsx';
import { unassignWorkerCommand } from './workforce-commands.ts';
import type { ServiceJobRef } from '@app/service-jobs/resources/service-job';
import type { Worker } from '../../../../shared/resources/worker.ts';
import { DateTime, Option } from 'effect';
import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import type { useWorkforceController } from './use-workforce-controller.ts';
import { availabilityLabel, cardClass, inputDate, moveWeek, stackClass } from './workforce-view.ts';

interface Props {
  readonly controller: ReturnType<typeof useWorkforceController>;
  readonly label: (key: string) => string;
}
export const WeeklySchedule = ({ controller, label }: Props) => {
  const { dispatch, locked, state } = controller;
  const { jobs, loading, weekStart } = state;
  const removeMember = (workerId: Worker['ref']['resourceId'], jobRef: ServiceJobRef) =>
    controller.submit((key) => unassignWorkerCommand({ jobRef, workerId }, key));
  return (
    <section aria-label={label('schedule')} className={stackClass}>
      <div className="workforce:flex workforce:flex-wrap workforce:items-end workforce:gap-3">
        <Button
          disabled={locked || weekStart === ''}
          onClick={() => dispatch({ jobRef: null, weekStart: moveWeek(weekStart, -7) })}
          size="lg"
          theme="outlined"
        >
          {label('previousWeek')}
        </Button>
        <FormInput
          disabled={locked}
          id="week-start"
          label={label('weekStart')}
          onChange={(event) => {
            if (event.currentTarget.value !== '') {
              dispatch({ jobRef: null, weekStart: event.currentTarget.value });
            }
          }}
          type="date"
          value={weekStart}
        />
        <Button
          disabled={locked || weekStart === ''}
          onClick={() => dispatch({ jobRef: null, weekStart: moveWeek(weekStart, 7) })}
          size="lg"
          theme="outlined"
        >
          {label('nextWeek')}
        </Button>
      </div>
      <p>{label('timeZone')}</p>
      {loading && <output>{label('loading')}</output>}
      {!loading && jobs.length === 0 && state.failure === null && <p>{label('noJobs')}</p>}
      <ul className={stackClass}>
        {jobs.map(({ crew, job }) => {
          const completeTime = Option.isSome(job.scheduledStartAt) && Option.isSome(job.expectedDurationMinutes);
          const end =
            Option.isSome(job.scheduledStartAt) && Option.isSome(job.expectedDurationMinutes)
              ? inputDate(DateTime.add(job.scheduledStartAt.value, { minutes: job.expectedDurationMinutes.value }))
              : null;
          return (
            <li className={cardClass} key={job.ref.resourceId}>
              <article className={stackClass}>
                <h3 className="workforce:text-xl workforce:font-semibold">
                  {job.serviceLocation.addressLine}, {job.serviceLocation.city}
                </h3>
                <p>{job.serviceScope.description}</p>
                <p>
                  {Option.isSome(job.scheduledStartAt) ? inputDate(job.scheduledStartAt.value) : label('unknownTime')} –{' '}
                  {end ?? label('unknownDuration')}
                </p>
                <p>{label(`jobStatus.${job.status}`)}</p>
                <h4>{label('crew')}</h4>
                {crew.length === 0 && <p>{label('noCrew')}</p>}
                <ul className={stackClass}>
                  {crew.map((member) => (
                    <li key={member.worker.ref.resourceId}>
                      <Button
                        disabled={locked}
                        onClick={() => dispatch({ failure: null, selectedId: member.worker.ref.resourceId })}
                        size="lg"
                        theme="outlined"
                      >
                        {member.worker.displayName}
                      </Button>
                      {job.status === 'PLANNED' && (
                        <>
                          <p role={member.availability.state === 'AVAILABLE' ? undefined : 'alert'}>
                            {availabilityLabel(member.availability, label)}
                          </p>
                          <Button
                            disabled={locked}
                            onClick={() => removeMember(member.worker.ref.resourceId, job.ref)}
                            size="lg"
                            theme="outlined"
                          >
                            {label('unassign')}
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {job.status === 'PLANNED' ? (
                  <>
                    {!completeTime && <p role="alert">{label('unknownDurationHelp')}</p>}
                    <Button
                      disabled={locked || !completeTime}
                      onClick={() => dispatch({ failure: null, jobRef: job.ref })}
                      size="lg"
                    >
                      {label('manageCrew')}
                    </Button>
                  </>
                ) : (
                  <p>{label('crewReadonly')}</p>
                )}
                <CrewSelector controller={controller} job={job} label={label} />
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
