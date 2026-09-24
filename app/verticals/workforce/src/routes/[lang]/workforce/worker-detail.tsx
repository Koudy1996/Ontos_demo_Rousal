import { useReducer } from 'react';
import { Option } from 'effect';
import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import type { WorkerDetailSchema } from '../../../../shared/workforce-views.ts';
import type { useWorkforceController } from './use-workforce-controller.ts';
import { WorkerForm } from './worker-form.tsx';
import {
  addAbsenceCommand,
  removeAbsenceCommand,
  changeWorkerStatusCommand,
  updateWorkerCommand,
} from './workforce-commands.ts';
import { availabilityLabel, cardClass, inputDate, selectClass, stackClass } from './workforce-view.ts';

interface Props {
  readonly controller: ReturnType<typeof useWorkforceController>;
  readonly detail: typeof WorkerDetailSchema.Type;
  readonly label: (key: string) => string;
  readonly today: string;
}
export const WorkerDetail = ({ controller, detail, label, today }: Props) => {
  const [draft, setDraft] = useReducer(
    (
      state: { dateFrom: string; dateTo: string; reason: string },
      patch: Partial<{ dateFrom: string; dateTo: string; reason: string }>,
    ) => ({ ...state, ...patch }),
    { dateFrom: '', dateTo: '', reason: 'VACATION' },
  );
  const { absences, jobs, worker } = detail;
  const { locked, submit } = controller;
  return (
    <article className={stackClass}>
      <h2 className="workforce:text-2xl workforce:font-semibold">{worker.displayName}</h2>
      <p>
        {label(`status.${worker.status}`)} · {label(`agreementType.${worker.agreementType}`)}
      </p>
      {Option.isSome(worker.phone) && (
        <a className="workforce:min-h-12 workforce:py-3" href={`tel:${worker.phone.value}`}>
          {worker.phone.value}
        </a>
      )}
      <Button
        disabled={locked}
        onClick={() =>
          submit((key) =>
            changeWorkerStatusCommand(
              {
                expectedRevision: worker.revision,
                id: worker.ref.resourceId,
                status: worker.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
              },
              key,
            ),
          )
        }
        size="lg"
        theme="outlined"
      >
        {label(worker.status === 'ACTIVE' ? 'deactivate' : 'activate')}
      </Button>
      <WorkerForm
        disabled={locked}
        key={worker.revision}
        label={label}
        submit={(input) => submit((key) => updateWorkerCommand(input, worker, key))}
        worker={worker}
      />
      <section aria-labelledby="absence-heading" className={stackClass}>
        <h3 className="workforce:text-xl workforce:font-semibold" id="absence-heading">
          {label('absences')}
        </h3>
        {absences.length === 0 && <p>{label('noAbsences')}</p>}
        <ul className={stackClass}>
          {absences.map((absence) => (
            <li className={cardClass} key={absence.id}>
              <p>
                {absence.dateFrom} – {absence.dateTo} · {label(`reason.${absence.reason}`)}
              </p>
              {today !== '' && absence.dateFrom > today ? (
                <Button
                  disabled={locked}
                  onClick={() =>
                    submit((key) => removeAbsenceCommand({ id: absence.id, workerId: worker.ref.resourceId }, key))
                  }
                  size="lg"
                  theme="outlined"
                >
                  {label('removeAbsence')}
                </Button>
              ) : (
                <p>{label('historicalAbsence')}</p>
              )}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();

            submit((key) =>
              addAbsenceCommand(
                {
                  dateFrom: draft.dateFrom,
                  dateTo: draft.dateTo,
                  reason: draft.reason,
                  workerId: worker.ref.resourceId,
                },
                key,
              ),
            );
          }}
        >
          <fieldset className={stackClass} disabled={locked}>
            <legend>{label('addAbsence')}</legend>
            <FormInput
              id="absence-from"
              label={label('dateFrom')}
              name="dateFrom"
              onChange={(event) => setDraft({ dateFrom: event.currentTarget.value })}
              required
              type="date"
              value={draft.dateFrom}
            />
            <FormInput
              id="absence-to"
              label={label('dateTo')}
              name="dateTo"
              onChange={(event) => setDraft({ dateTo: event.currentTarget.value })}
              required
              type="date"
              value={draft.dateTo}
            />
            <label htmlFor="absence-reason">{label('absenceReason')}</label>
            <select
              className={selectClass}
              id="absence-reason"
              name="reason"
              onChange={(event) => setDraft({ reason: event.currentTarget.value })}
              value={draft.reason}
            >
              {['VACATION', 'SICK', 'OTHER'].map((reason) => (
                <option key={reason} value={reason}>
                  {label(`reason.${reason}`)}
                </option>
              ))}
            </select>
            <p>{label('absenceHelp')}</p>
            <Button size="lg" type="submit">
              {label('addAbsence')}
            </Button>
          </fieldset>
        </form>
      </section>
      <section aria-labelledby="assigned-heading" className={stackClass}>
        <h3 className="workforce:text-xl workforce:font-semibold" id="assigned-heading">
          {label('assignedJobs')}
        </h3>
        {jobs.length === 0 && <p>{label('noAssignedJobs')}</p>}
        <ul className={stackClass}>
          {jobs.map((item) => (
            <li className={cardClass} key={item.job.ref.resourceId}>
              <p>
                {item.job.serviceLocation.addressLine}, {item.job.serviceLocation.city}
              </p>
              <p>
                {Option.isSome(item.job.scheduledStartAt)
                  ? inputDate(item.job.scheduledStartAt.value)
                  : label('unknownTime')}{' '}
                · {label(`jobStatus.${item.job.status}`)}
              </p>
              {item.crew.map((member) => (
                <p key={member.worker.ref.resourceId}>{availabilityLabel(member.availability, label)}</p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
};
