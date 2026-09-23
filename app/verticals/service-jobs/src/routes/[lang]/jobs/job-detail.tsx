import { useJobDrafts } from './use-job-drafts.ts';
import { Button } from '@techsio/ui-kit/atoms/button';
import type { useJobsController } from './use-jobs-controller.ts';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import { formClass, localInput } from './job-view.ts';

interface ViewProps {
  readonly controller: ReturnType<typeof useJobsController>;
  readonly label: (key: string) => string;
  readonly selected: NonNullable<ReturnType<typeof useJobsController>['state']['selected']>;
}
export const JobDetail = ({ controller, label, selected }: ViewProps) => {
  const { locked, state } = controller;
  const { names } = state;
  const { executionDraft, scheduleDraft, setChecklist, setExecutionNote, setScheduleDraft } = useJobDrafts(selected);

  return (
    <article className={formClass}>
      <h2 className="servicejobs:mt-4 servicejobs:text-2xl servicejobs:font-semibold">
        {names.get(selected.partyRef.resourceId) ?? label('contact')}
      </h2>
      <p>{label(`status.${selected.status}`)}</p>
      <dl className="servicejobs:grid servicejobs:gap-2 servicejobs:sm:grid-cols-2">
        <dt>{label('location')}</dt>
        <dd>
          {selected.serviceLocation.addressLine}, {selected.serviceLocation.postalCode} {selected.serviceLocation.city}
        </dd>
        <dt>{label('scope')}</dt>
        <dd>{selected.serviceScope.description}</dd>
        <dt>{label('objectType')}</dt>
        <dd>{label(`object.${selected.serviceScope.objectType}`)}</dd>
        <dt>{label('floor')}</dt>
        <dd>{selected.serviceScope.floor ?? '—'}</dd>
        <dt>{label('elevator')}</dt>
        <dd>{selected.serviceScope.elevator === null ? '—' : label(selected.serviceScope.elevator ? 'yes' : 'no')}</dd>
        <dt>{label('volume')}</dt>
        <dd>{selected.serviceScope.estimatedVolumeM3 ?? '—'}</dd>
        <dt>{label('waste')}</dt>
        <dd>{selected.serviceScope.specialWaste ?? '—'}</dd>
        <dt>{label('price')}</dt>
        <dd>
          {selected.commercialSummary.total} CZK ({label(`priceBasis.${selected.commercialSummary.priceBasis}`)})
        </dd>
        <dt>{label('scheduledStartAt')}</dt>
        <dd>{localInput(selected.scheduledStartAt).replace('T', ' ') || label('unscheduled')}</dd>
        <dt>{label('startedAt')}</dt>
        <dd>{localInput(selected.startedAt).replace('T', ' ') || '—'}</dd>
        <dt>{label('completedAt')}</dt>
        <dd>{localInput(selected.completedAt).replace('T', ' ') || '—'}</dd>
      </dl>
      {selected.status === 'PLANNED' && (
        <Button disabled={locked} onClick={() => controller.start()} size="lg">
          {label('start')}
        </Button>
      )}
      {selected.status === 'IN_PROGRESS' && (
        <Button disabled={locked} onClick={() => controller.finish()} size="lg">
          {label('complete')}
        </Button>
      )}
      {selected.status === 'COMPLETED' && <output>{label('billingReady')}</output>}
      {(selected.status === 'NEW' || selected.status === 'PLANNED') && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            controller.schedule(scheduleDraft);
          }}
        >
          <fieldset className={formClass} disabled={locked}>
            <legend>{label('schedule')}</legend>
            <FormInput
              id="scheduled-start"
              label={label('scheduledStartAt')}
              name="scheduledStartAt"
              onChange={(event) => {
                const localStart = event.currentTarget.value;
                setScheduleDraft({ localStart });
              }}
              required
              type="datetime-local"
              value={scheduleDraft.localStart}
            />
            <p>{label('timeZone')}</p>
            <FormInput
              id="expected-duration"
              label={label('expectedDurationMinutes')}
              max={10_080}
              min={1}
              name="expectedDurationMinutes"
              onChange={(event) => {
                const expectedDurationMinutes = event.currentTarget.value;
                setScheduleDraft({ expectedDurationMinutes });
              }}
              type="number"
              value={scheduleDraft.expectedDurationMinutes}
            />
            <Button size="lg" type="submit">
              {label('saveSchedule')}
            </Button>
          </fieldset>
        </form>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          controller.execution(executionDraft);
        }}
      >
        <fieldset className={formClass} disabled={locked || selected.status === 'COMPLETED'}>
          <legend>{label('execution')}</legend>
          {(['accessChecked', 'cleared', 'wasteRemoved', 'handedOver'] as const).map((name) => (
            <label
              className="servicejobs:flex servicejobs:min-h-12 servicejobs:items-center servicejobs:gap-3"
              key={name}
            >
              <input
                checked={executionDraft.checklist[name]}
                name={name}
                onChange={(event) => setChecklist(name, event.currentTarget.checked)}
                type="checkbox"
              />
              {label(`checklist.${name}`)}
            </label>
          ))}
          <FormInput
            id="execution-note"
            label={label('executionNote')}
            maxLength={4000}
            name="executionNote"
            onChange={(event) => setExecutionNote(event.currentTarget.value)}
            value={executionDraft.executionNote}
          />
          {selected.status !== 'COMPLETED' && (
            <Button size="lg" type="submit">
              {label('saveExecution')}
            </Button>
          )}
        </fieldset>
      </form>
    </article>
  );
};
