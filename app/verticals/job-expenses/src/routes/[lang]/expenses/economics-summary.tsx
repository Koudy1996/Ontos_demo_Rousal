import type { JobEconomicsResponseSchema } from '../../../../shared/apis/job-economics.ts';
import { cardClass, formatMoney } from './job-expenses-view.ts';

interface Props {
  readonly economics: typeof JobEconomicsResponseSchema.Type;
  readonly label: (key: string) => string;
}

export const EconomicsSummary = ({ economics, label }: Props) => (
  <section aria-labelledby="economics-title" className="jobexpenses:grid jobexpenses:gap-4">
    <h2 className="jobexpenses:text-2xl jobexpenses:font-semibold" id="economics-title">
      {label('summary.title')}
    </h2>
    <div className="jobexpenses:grid jobexpenses:gap-3 jobexpenses:sm:grid-cols-2 jobexpenses:lg:grid-cols-3">
      <article className={cardClass}>
        <h3 className="jobexpenses:text-sm jobexpenses:font-semibold jobexpenses:text-stone-600">
          {label('summary.agreedPrice')}
        </h3>
        <p className="jobexpenses:mt-2 jobexpenses:text-2xl jobexpenses:font-bold">
          {formatMoney(economics.agreedPriceCzk, label)}
        </p>
        <p>{label(`priceBasis.${economics.priceBasis}`)}</p>
      </article>
      <article className={cardClass}>
        <h3 className="jobexpenses:text-sm jobexpenses:font-semibold jobexpenses:text-stone-600">
          {label('summary.recordedCosts')}
        </h3>
        <p className="jobexpenses:mt-2 jobexpenses:text-2xl jobexpenses:font-bold">
          {formatMoney(economics.recordedCostTotal, label)}
        </p>
        <p>{label('summary.excludingVat')}</p>
      </article>
      <article className={cardClass}>
        <h3 className="jobexpenses:text-sm jobexpenses:font-semibold jobexpenses:text-stone-600">
          {label('summary.difference')}
        </h3>
        {economics.differenceCzk === null ? (
          <p className="jobexpenses:mt-2">{label(`comparison.${economics.comparisonReason ?? 'unavailable'}`)}</p>
        ) : (
          <>
            <p className="jobexpenses:mt-2 jobexpenses:text-2xl jobexpenses:font-bold">
              {formatMoney(economics.differenceCzk, label)}
            </p>
            {economics.marginPercent !== null && (
              <p>
                {label('summary.margin')}: {economics.marginPercent} %
              </p>
            )}
          </>
        )}
      </article>
    </div>
    <dl className="jobexpenses:grid jobexpenses:grid-cols-1 jobexpenses:gap-2 jobexpenses:sm:grid-cols-2 jobexpenses:lg:grid-cols-5">
      {(['WORK', 'TRANSPORT', 'DISPOSAL', 'MATERIAL', 'OTHER'] as const).map((category) => (
        <div className={cardClass} key={category}>
          <dt className="jobexpenses:text-sm jobexpenses:text-stone-600">{label(`category.${category}`)}</dt>
          <dd className="jobexpenses:font-semibold">{formatMoney(economics.categoryTotals[category], label)}</dd>
        </div>
      ))}
    </dl>
    <p className="jobexpenses:text-sm jobexpenses:text-stone-600">{label('summary.disclaimer')}</p>
  </section>
);
