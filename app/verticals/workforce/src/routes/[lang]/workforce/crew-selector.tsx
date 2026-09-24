import { Button } from '@techsio/ui-kit/atoms/button';
import type { useWorkforceController } from './use-workforce-controller.ts';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { assignWorkerCommand, unassignWorkerCommand } from './workforce-commands.ts';
import { availabilityLabel, cardClass, stackClass } from './workforce-view.ts';

interface Props {
  readonly controller: ReturnType<typeof useWorkforceController>;
  readonly job: ServiceJob;
  readonly label: (key: string) => string;
}
export const CrewSelector = ({ controller, job, label }: Props) => {
  const { locked, state, submit } = controller;
  const { candidates, jobRef, loadingCrew } = state;
  return (
    jobRef?.resourceId === job.ref.resourceId && (
      <section aria-label={label('manageCrew')} className={stackClass}>
        {loadingCrew && <output>{label('loading')}</output>}
        {!loadingCrew && candidates.length === 0 && state.failure === null && <p>{label('noWorkers')}</p>}
        <ul className={stackClass}>
          {candidates.map((candidate) => (
            <li className={cardClass} key={candidate.worker.ref.resourceId}>
              <p>{candidate.worker.displayName}</p>
              <p>{availabilityLabel(candidate.availability, label)}</p>
              <Button
                disabled={locked || (!candidate.assigned && candidate.availability.state !== 'AVAILABLE')}
                onClick={() =>
                  submit((key) =>
                    candidate.assigned
                      ? unassignWorkerCommand({ jobRef: job.ref, workerId: candidate.worker.ref.resourceId }, key)
                      : assignWorkerCommand({ jobRef: job.ref, workerId: candidate.worker.ref.resourceId }, key),
                  )
                }
                size="lg"
                theme={candidate.assigned ? 'outlined' : 'solid'}
              >
                {label(candidate.assigned ? 'unassign' : 'assign')}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    )
  );
};
