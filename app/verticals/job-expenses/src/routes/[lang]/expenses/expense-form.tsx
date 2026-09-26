import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import { Result, Schema } from 'effect';
import { useReducer } from 'react';
import type { JobExpense } from '../../../../shared/resources/job-expense.ts';
import { JobExpenseCategorySchema } from '../../../../shared/resources/job-expense.ts';
import type { ExpenseDraft } from './job-expense-commands.ts';
import { selectClass, stackClass, textareaClass } from './job-expenses-view.ts';

const initialDraft = (expense: JobExpense | undefined, today: string): ExpenseDraft => ({
  amountCzk: expense?.amountCzk ?? '',
  category: expense?.category ?? 'WORK',
  changeReason: '',
  description: expense?.description ?? '',
  incurredOn: expense?.incurredOn ?? today,
});
const reduce = (state: ExpenseDraft, patch: Partial<ExpenseDraft>): ExpenseDraft => ({ ...state, ...patch });

interface Props {
  readonly disabled: boolean;
  readonly expense?: JobExpense;
  readonly label: (key: string) => string;
  readonly onCancel: () => void;
  readonly onSubmit: (draft: ExpenseDraft) => void;
  readonly today: string;
}

export const ExpenseForm = ({ disabled, expense, label, onCancel, onSubmit, today }: Props) => {
  const [draft, setDraft] = useReducer(reduce, { expense, today }, ({ expense: current, today: date }) =>
    initialDraft(current, date),
  );
  return (
    <form
      className={stackClass}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <fieldset className={stackClass} disabled={disabled}>
        <legend className="jobexpenses:text-xl jobexpenses:font-semibold">
          {label(expense === undefined ? 'form.addTitle' : 'form.editTitle')}
        </legend>
        <label htmlFor="expense-category">{label('category.label')}</label>
        <select
          className={selectClass}
          id="expense-category"
          onChange={(event) => {
            const category = Schema.decodeUnknownResult(JobExpenseCategorySchema)(event.currentTarget.value);
            if (Result.isSuccess(category)) {
              setDraft({ category: category.success });
            }
          }}
          value={draft.category}
        >
          {(['WORK', 'TRANSPORT', 'DISPOSAL', 'MATERIAL', 'OTHER'] as const).map((category) => (
            <option key={category} value={category}>
              {label(`category.${category}`)}
            </option>
          ))}
        </select>
        <label htmlFor="expense-description">{label('form.description')}</label>
        <textarea
          className={textareaClass}
          id="expense-description"
          maxLength={500}
          onChange={(event) => setDraft({ description: event.currentTarget.value })}
          required
          value={draft.description}
        />
        <FormInput
          id="expense-date"
          label={label('form.incurredOn')}
          max={today}
          name="incurredOn"
          onChange={(event) => setDraft({ incurredOn: event.currentTarget.value })}
          required
          type="date"
          value={draft.incurredOn}
        />
        <FormInput
          id="expense-amount"
          inputMode="decimal"
          label={label('form.amount')}
          name="amountCzk"
          onChange={(event) => setDraft({ amountCzk: event.currentTarget.value })}
          pattern="(?:0[.,]0[1-9]|0[.,][1-9][0-9]|[1-9][0-9]{0,11}[.,][0-9]{2})"
          placeholder="0,00"
          required
          value={draft.amountCzk}
        />
        <p className="jobexpenses:text-sm jobexpenses:text-um-muted">{label('form.amountHelp')}</p>
        {expense !== undefined && (
          <label className={stackClass} htmlFor="expense-change-reason">
            <span>{label('form.changeReason')}</span>
            <textarea
              className={textareaClass}
              id="expense-change-reason"
              maxLength={500}
              onChange={(event) => setDraft({ changeReason: event.currentTarget.value })}
              required
              value={draft.changeReason}
            />
          </label>
        )}
      </fieldset>
      <div className="jobexpenses:flex jobexpenses:flex-wrap jobexpenses:gap-3">
        <Button disabled={disabled} size="lg" type="submit">
          {label('form.save')}
        </Button>
        <Button disabled={disabled} onClick={onCancel} size="lg" theme="outlined" type="button">
          {label('form.cancel')}
        </Button>
      </div>
    </form>
  );
};
