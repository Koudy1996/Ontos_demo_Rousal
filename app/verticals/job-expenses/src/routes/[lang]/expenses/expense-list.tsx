import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';
import { Option } from 'effect';
import { useState } from 'react';
import type { JobExpense } from '../../../../shared/resources/job-expense.ts';
import type { useJobExpensesController } from './use-job-expenses-controller.ts';
import { cardClass, formatMoney, stackClass } from './job-expenses-view.ts';

interface Props {
  readonly controller: ReturnType<typeof useJobExpensesController>;
  readonly label: (key: string) => string;
}

const VoidForm = ({ controller, expense, label }: Props & { readonly expense: JobExpense }) => {
  const [reason, setReason] = useState('');
  return (
    <form
      aria-label={label('void.title')}
      className="jobexpenses:mt-4 jobexpenses:grid jobexpenses:gap-3 jobexpenses:rounded-xl jobexpenses:bg-red-50 jobexpenses:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        controller.voidExpense(expense, reason);
      }}
    >
      <FormInput
        id={`void-reason-${expense.ref.resourceId}`}
        label={label('void.reason')}
        maxLength={500}
        name="voidReason"
        onChange={(event) => setReason(event.currentTarget.value)}
        required
        value={reason}
      />
      <div className="jobexpenses:flex jobexpenses:flex-wrap jobexpenses:gap-3">
        <Button disabled={controller.locked} size="lg" type="submit">
          {label('void.confirm')}
        </Button>
        <Button
          disabled={controller.locked}
          onClick={() => controller.dispatch({ voiding: null })}
          size="lg"
          theme="outlined"
          type="button"
        >
          {label('form.cancel')}
        </Button>
      </div>
    </form>
  );
};

export const ExpenseList = ({ controller, label }: Props) => {
  const { state } = controller;
  const handleLoadMoreCosts = () => controller.loadMoreCosts();
  return (
    <section aria-labelledby="expense-list-title" className={stackClass}>
      <div className="jobexpenses:flex jobexpenses:flex-wrap jobexpenses:items-center jobexpenses:justify-between jobexpenses:gap-3">
        <h2 className="jobexpenses:text-2xl jobexpenses:font-semibold" id="expense-list-title">
          {label('list.title')}
        </h2>
        <Button
          disabled={controller.locked}
          onClick={() => controller.dispatch({ editing: 'new', mutationFailure: null, voiding: null })}
          size="lg"
        >
          {label('list.add')}
        </Button>
      </div>
      {state.loadingCosts && state.costs.length === 0 && <output>{label('loading.costs')}</output>}
      {!state.loadingCosts && state.costs.length === 0 && state.listFailure === null && <p>{label('list.empty')}</p>}
      <ul className="jobexpenses:grid jobexpenses:gap-4">
        {state.costs.map((expense) => (
          <li className={`${cardClass} jobexpenses:grid jobexpenses:gap-3`} key={expense.ref.resourceId}>
            <div className="jobexpenses:flex jobexpenses:flex-wrap jobexpenses:items-start jobexpenses:justify-between jobexpenses:gap-3">
              <div className="jobexpenses:min-w-0">
                <p className="jobexpenses:font-semibold">{label(`category.${expense.category}`)}</p>
                <p className="jobexpenses:break-words">{expense.description}</p>
                <p className="jobexpenses:text-sm jobexpenses:text-um-muted">{expense.incurredOn}</p>
              </div>
              <p className="jobexpenses:text-lg jobexpenses:font-bold">{formatMoney(expense.amountCzk, label)}</p>
            </div>
            <p className={expense.status === 'VOIDED' ? 'jobexpenses:font-semibold jobexpenses:text-red-700' : ''}>
              {label(`status.${expense.status}`)}
            </p>
            {Option.isSome(expense.voidReason) && (
              <p className="jobexpenses:text-sm">
                {label('void.reason')}: {expense.voidReason.value}
              </p>
            )}
            {expense.status === 'RECORDED' && (
              <div className="jobexpenses:flex jobexpenses:flex-wrap jobexpenses:gap-3">
                <Button
                  disabled={controller.locked}
                  onClick={() => controller.dispatch({ editing: expense, mutationFailure: null, voiding: null })}
                  size="lg"
                  theme="outlined"
                >
                  {label('list.edit')}
                </Button>
                <Button
                  disabled={controller.locked}
                  onClick={() => controller.dispatch({ editing: null, mutationFailure: null, voiding: expense })}
                  size="lg"
                  theme="outlined"
                >
                  {label('list.void')}
                </Button>
              </div>
            )}
            {state.voiding?.ref.resourceId === expense.ref.resourceId && (
              <VoidForm controller={controller} expense={expense} label={label} />
            )}
          </li>
        ))}
      </ul>
      {state.costsCursor !== null && (
        <Button disabled={state.loadingCosts} onClick={handleLoadMoreCosts} size="lg" theme="outlined">
          {label('list.loadMore')}
        </Button>
      )}
    </section>
  );
};
