import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Schema } from 'effect';
import { Button } from '@techsio/ui-kit/atoms/button';
import { Badge } from '@techsio/ui-kit/atoms/badge';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';

import { moneyFields, formClass, InquirySelect, visitInput } from './inquiry-form-fields.tsx';
import type { useInquiriesController } from './use-inquiries-controller.ts';

const detailFields = Schema.Literals([
  'requestedDate',
  'floor',
  'estimatedVolumeM3',
  'specialWaste',
  'siteVisitAt',
  'internalNote',
]).literals;

interface ViewProps {
  readonly controller: ReturnType<typeof useInquiriesController>;
  readonly label: (key: string) => string;
}
export const InquiryDetail = ({ controller, label }: ViewProps) => {
  const { language } = useModernI18n();
  const { changeStage, dispatch, locked, offerSubmit, state } = controller;
  const { names, selected } = state;
  if (selected === null) {
    return null;
  }
  return (
    <article className={formClass}>
      <Button
        disabled={locked}
        onClick={() => {
          dispatch({ selected: null });
          dispatch({ failure: null });
        }}
        size="lg"
        theme="outlined"
      >
        {label('back')}
      </Button>
      <h2 className="salesinquiries:text-2xl salesinquiries:font-semibold">
        {names.get(selected.partyRef.resourceId) ?? label('contact')}
      </h2>
      <Badge>{label(`stage.${selected.stage}`)}</Badge>
      <p>
        {selected.location.addressLine}, {selected.location.postalCode} {selected.location.city}
      </p>
      <p>
        {label(`objectType.${selected.objectType}`)} · {selected.description}
      </p>
      <dl className="salesinquiries:grid salesinquiries:grid-cols-1 salesinquiries:gap-2 salesinquiries:sm:grid-cols-2">
        {detailFields.map((key) => (
          <div key={key}>
            <dt className="salesinquiries:font-semibold">{label(key)}</dt>
            <dd>
              {key === 'siteVisitAt' && selected.siteVisitAt !== null
                ? visitInput(selected.siteVisitAt).replace('T', ' ')
                : String(selected[key] ?? label('notSet'))}
            </dd>
          </div>
        ))}
      </dl>
      {['NEW', 'SITE_VISIT', 'PRICING'].includes(selected.stage) && (
        <Button
          disabled={locked}
          onClick={() => {
            dispatch({ party: null });
            dispatch({ editing: true });
          }}
          size="lg"
        >
          {label('edit')}
        </Button>
      )}
      {selected.stage === 'NEW' && (
        <form action={(data) => changeStage('SITE_VISIT', data)} className={formClass}>
          <FormInput
            disabled={locked}
            id="plan-visit"
            label={label('siteVisitAt')}
            name="siteVisitAt"
            type="datetime-local"
          />
          <Button disabled={locked} size="lg" type="submit">
            {label('planVisit')}
          </Button>
        </form>
      )}
      {['NEW', 'SITE_VISIT'].includes(selected.stage) && (
        <Button disabled={locked} onClick={() => changeStage('PRICING')} size="lg">
          {label('startPricing')}
        </Button>
      )}
      {selected.offer !== null && (
        <section aria-label={label('offer')} className={formClass}>
          <h3>{label('offer')}</h3>
          <dl>
            {moneyFields.map((key) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>{selected.offer?.[key]} CZK</dd>
              </div>
            ))}
          </dl>
          <p className="salesinquiries:text-xl salesinquiries:font-bold">
            {label('total')}: {selected.offer.total} CZK
          </p>
          <p>{label(`priceBasis.${selected.offer.priceBasis}`)}</p>
          {selected.sentAt !== null && (
            <p>
              {label('sentAt')}: {selected.sentAt}
            </p>
          )}
        </section>
      )}
      {selected.stage === 'PRICING' && (
        <>
          <form action={offerSubmit} className={formClass}>
            <fieldset className={formClass} disabled={locked}>
              <legend>{label('offer')}</legend>
              <InquirySelect
                current={selected.offer?.priceBasis ?? 'EXCLUDING_VAT'}
                label={label}
                locked={locked}
                name="priceBasis"
                values={['EXCLUDING_VAT', 'INCLUDING_VAT']}
              />
              {moneyFields.map((key) => (
                <FormInput
                  defaultValue={selected.offer?.[key] ?? '0'}
                  id={key}
                  inputMode="decimal"
                  key={key}
                  label={label(key)}
                  name={key}
                  required
                />
              ))}
              <FormInput
                defaultValue={selected.offer?.estimatedPersonHours ?? ''}
                id="estimatedPersonHours"
                inputMode="decimal"
                label={label('estimatedPersonHours')}
                name="estimatedPersonHours"
              />
            </fieldset>
            <Button disabled={locked} size="lg" type="submit">
              {label('saveOffer')}
            </Button>
          </form>
          <Button disabled={locked || selected.offer === null} onClick={() => changeStage('OFFER_SENT')} size="lg">
            {label('sendOffer')}
          </Button>
        </>
      )}
      {selected.stage === 'OFFER_SENT' && (
        <>
          <form action={(data) => changeStage('ACCEPTED', data)} className={formClass}>
            <p>{label('acceptanceMeaning')}</p>
            <InquirySelect
              current="PHONE"
              label={label}
              locked={locked}
              name="method"
              values={['PHONE', 'EMAIL', 'IN_PERSON', 'OTHER']}
            />
            <FormInput disabled={locked} id="evidenceNote" label={label('evidenceNote')} name="evidenceNote" required />
            <Button disabled={locked} size="lg" type="submit">
              {label('accept')}
            </Button>
          </form>
          <form action={(data) => changeStage('DECLINED', data)} className={formClass}>
            <FormInput disabled={locked} id="declineReason" label={label('declineReason')} name="declineReason" />
            <Button disabled={locked} size="lg" theme="outlined" type="submit">
              {label('decline')}
            </Button>
          </form>
        </>
      )}
      {selected.stage === 'ACCEPTED' && (
        <section>
          <h3>{label('readyForJob')}</h3>
          <a
            className="salesinquiries:flex salesinquiries:min-h-12 salesinquiries:items-center salesinquiries:underline"
            href={`/${language}/jobs?source=${encodeURIComponent(selected.ref.resourceId)}`}
          >
            {label('createJob')}
          </a>
          <p>{selected.acceptedAt}</p>
          <p>
            {label(`method.${selected.acceptance?.method}`)}: {selected.acceptance?.evidenceNote}
          </p>
        </section>
      )}
      {selected.stage === 'DECLINED' && (
        <p>
          {selected.declinedAt} · {selected.declineReason}
        </p>
      )}
    </article>
  );
};
