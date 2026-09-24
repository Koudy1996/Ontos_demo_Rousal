import { useReducer } from 'react';
import { Option } from 'effect';
import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import type { Worker, WorkerProfileSchema } from '../../../../shared/resources/worker.ts';
import { stackClass, selectClass } from './workforce-view.ts';

export type WorkerDraft = { readonly [Key in keyof typeof WorkerProfileSchema.Encoded]: string };
const initialDraft = (worker: Worker | undefined): WorkerDraft => ({
  agreementType: worker?.agreementType ?? 'DPP',
  agreementValidFrom: worker?.agreementValidFrom ?? '',
  agreementValidTo: worker === undefined ? '' : Option.getOrElse(worker.agreementValidTo, () => ''),
  displayName: worker?.displayName ?? '',
  internalHourlyCostCzk: worker === undefined ? '' : Option.getOrElse(worker.internalHourlyCostCzk, () => ''),
  phone: worker === undefined ? '' : Option.getOrElse(worker.phone, () => ''),
  position: worker === undefined ? '' : Option.getOrElse(worker.position, () => ''),
});
const reduce = (state: WorkerDraft, patch: Partial<WorkerDraft>): WorkerDraft => ({ ...state, ...patch });
interface Props {
  readonly disabled: boolean;
  readonly label: (key: string) => string;
  readonly submit: (input: WorkerDraft) => void;
  readonly worker?: Worker;
}
export const WorkerForm = ({ disabled, label, submit, worker }: Props) => {
  const [draft, setDraft] = useReducer(reduce, worker, initialDraft);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(draft);
      }}
    >
      <fieldset className={stackClass} disabled={disabled}>
        <legend className="workforce:mb-4 workforce:text-xl workforce:font-semibold">
          {label(worker === undefined ? 'newWorker' : 'editWorker')}
        </legend>
        <FormInput
          id="worker-displayName"
          label={label('name')}
          maxLength={500}
          name="displayName"
          onChange={(event) => setDraft({ displayName: event.currentTarget.value })}
          required
          type="text"
          value={draft.displayName}
        />
        <FormInput
          id="worker-phone"
          label={label('phone')}
          maxLength={200}
          name="phone"
          onChange={(event) => setDraft({ phone: event.currentTarget.value })}
          type="tel"
          value={draft.phone}
        />
        <FormInput
          id="worker-position"
          label={label('position')}
          maxLength={500}
          name="position"
          onChange={(event) => setDraft({ position: event.currentTarget.value })}
          type="text"
          value={draft.position}
        />
        <label htmlFor="worker-agreement">{label('agreement')}</label>
        <select
          className={selectClass}
          id="worker-agreement"
          name="agreementType"
          onChange={(event) => setDraft({ agreementType: event.currentTarget.value })}
          value={draft.agreementType}
        >
          {['EMPLOYMENT', 'DPP', 'DPC', 'CONTRACTOR'].map((type) => (
            <option key={type} value={type}>
              {label(`agreementType.${type}`)}
            </option>
          ))}
        </select>
        <FormInput
          id="worker-valid-from"
          label={label('validFrom')}
          name="agreementValidFrom"
          onChange={(event) => setDraft({ agreementValidFrom: event.currentTarget.value })}
          required
          type="date"
          value={draft.agreementValidFrom}
        />
        <FormInput
          id="worker-valid-to"
          label={label('validTo')}
          name="agreementValidTo"
          onChange={(event) => setDraft({ agreementValidTo: event.currentTarget.value })}
          type="date"
          value={draft.agreementValidTo}
        />
        <FormInput
          id="worker-cost"
          inputMode="decimal"
          label={label('hourlyCost')}
          name="internalHourlyCostCzk"
          onChange={(event) => setDraft({ internalHourlyCostCzk: event.currentTarget.value })}
          value={draft.internalHourlyCostCzk}
        />
        <p>{label('agreementHelp')}</p>
        <Button size="lg" type="submit">
          {label('save')}
        </Button>
      </fieldset>
    </form>
  );
};
