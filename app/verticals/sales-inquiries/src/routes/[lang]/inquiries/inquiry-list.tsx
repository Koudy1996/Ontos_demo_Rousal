import { Button } from '@techsio/ui-kit/atoms/button';
import { Badge } from '@techsio/ui-kit/atoms/badge';
import { Schema } from 'effect';
import { InquiryStageSchema } from '../../../../shared/resources/sales-inquiry.ts';

import { formClass, InquirySelect } from './inquiry-form-fields.tsx';
import type { useInquiriesController } from './use-inquiries-controller.ts';

interface ViewProps {
  readonly controller: ReturnType<typeof useInquiriesController>;
  readonly label: (key: string) => string;
}
export const InquiryList = ({ controller, label }: ViewProps) => {
  const { dispatch, locked, open, state } = controller;
  const { loading, names, rows, stage } = state;
  return (
    <div className={formClass}>
      <InquirySelect
        current={stage ?? 'ALL'}
        label={label}
        locked={locked}
        name="stage"
        onChange={(value) => {
          if (value === 'ALL') {
            dispatch({ stage: null });
          } else if (Schema.is(InquiryStageSchema)(value)) {
            dispatch({ stage: value });
          }
          dispatch({ failure: null });
        }}
        values={['ALL', ...InquiryStageSchema.literals]}
      />
      {loading ? <output>{label('loading')}</output> : null}
      {!loading && rows.length === 0 && <p>{label('empty')}</p>}
      {!loading && rows.length > 0 && (
        <ul className="salesinquiries:grid salesinquiries:grid-cols-1 salesinquiries:gap-4 salesinquiries:md:grid-cols-2">
          {rows.map((item) => (
            <li
              className="salesinquiries:min-w-0 salesinquiries:rounded-2xl salesinquiries:border salesinquiries:border-um-border salesinquiries:bg-um-surface salesinquiries:p-5 salesinquiries:shadow-sm"
              key={item.ref.resourceId}
            >
              <article className={formClass}>
                <h2 className="salesinquiries:text-lg salesinquiries:font-semibold">
                  {names.get(item.partyRef.resourceId)}
                </h2>
                <Badge>{label(`stage.${item.stage}`)}</Badge>
                <p>
                  {item.location.addressLine}, {item.location.city}
                </p>
                <p>
                  {label('requestedDate')}: {item.requestedDate ?? label('notSet')}
                </p>
                {item.offer !== null && (
                  <p>
                    {item.offer.total} CZK · {label(`priceBasis.${item.offer.priceBasis}`)}
                  </p>
                )}
                <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time>
                <Button onClick={() => open(item.ref.resourceId)} size="lg">
                  {label('open')}
                </Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
