import { useModernI18n } from '@modern-js/plugin-i18n/runtime';
import { Button } from '@techsio/ui-kit/atoms/button';
import { DateTime } from 'effect';
import { useState } from 'react';
import type { InvoiceAddress, RecipientAddressSelection } from '../../../../shared/resources/invoice.ts';
import { UltramodernRouteHead } from '../../ultramodern-route-head';
import { useInvoicesController } from './use-invoices-controller.ts';

const card =
  'billingdocuments:min-w-0 billingdocuments:rounded-2xl billingdocuments:border billingdocuments:border-stone-200 billingdocuments:bg-white billingdocuments:p-4 billingdocuments:shadow-sm';
const field =
  'billingdocuments:w-full billingdocuments:rounded-xl billingdocuments:border billingdocuments:border-stone-300 billingdocuments:bg-white billingdocuments:px-3 billingdocuments:py-3 billingdocuments:text-base';
const money = (value: string, currency: string, language: string) =>
  new Intl.NumberFormat(language, { currency, style: 'currency' }).format(Number(value));
const addressText = (address: InvoiceAddress) =>
  [address.addressLine1, address.addressLine2, address.city, address.postalCode, address.countryCode]
    .filter(Boolean)
    .join(', ');
const dateText = (value: DateTime.Utc | null, language: string) =>
  value === null ? '—' : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(DateTime.toDateUtc(value));
const estimatedDueText = (
  semantics: { readonly days: number; readonly kind: 'NET_DAYS' } | { readonly kind: 'IMMEDIATE' } | undefined,
  language: string,
) => {
  if (semantics === undefined) {
    return '—';
  }
  const due = DateTime.add(DateTime.nowUnsafe(), { days: semantics.kind === 'NET_DAYS' ? semantics.days : 0 });
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(DateTime.toDateUtc(due));
};
const selectionsEqual = (left: RecipientAddressSelection | null, right: RecipientAddressSelection | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'PARTY_CONTACT_POINT' && right.kind === 'PARTY_CONTACT_POINT') {
    return (
      left.contactPointRef.resourceId === right.contactPointRef.resourceId &&
      left.contactPointRef.tenantId === right.contactPointRef.tenantId
    );
  }
  if (left.kind === 'ONE_TIME' && right.kind === 'ONE_TIME') {
    return (
      left.address.addressLine1 === right.address.addressLine1 &&
      left.address.addressLine2 === right.address.addressLine2 &&
      left.address.city === right.address.city &&
      left.address.countryCode === right.address.countryCode &&
      left.address.postalCode === right.address.postalCode &&
      left.address.region === right.address.region
    );
  }
  return false;
};

const ErrorPanel = ({
  controller,
  label,
}: {
  readonly controller: ReturnType<typeof useInvoicesController>;
  readonly label: (key: string) => string;
}) => {
  const failure = controller.state.error;
  const handleRecover = () => controller.recover();
  const handleReload = () => controller.reload();
  const handleRetry = () => controller.retry();
  if (failure === null) {
    return null;
  }
  return (
    <div
      className="billingdocuments:grid billingdocuments:gap-3 billingdocuments:rounded-xl billingdocuments:bg-red-50 billingdocuments:p-4"
      role="alert"
    >
      <p>{label(`error.${failure.kind}`)}</p>
      {failure.kind === 'uncertain' && failure.invocationId !== undefined && (
        <Button disabled={controller.state.pending} onClick={handleRecover}>
          {label('resolve')}
        </Button>
      )}
      {failure.kind === 'unavailable' && (
        <Button disabled={controller.state.pending} onClick={handleRetry}>
          {label('retry')}
        </Button>
      )}
      {failure.kind !== 'uncertain' && failure.kind !== 'unavailable' && (
        <Button disabled={controller.state.pending} onClick={handleReload}>
          {label('reload')}
        </Button>
      )}
    </div>
  );
};

// eslint-disable-next-line complexity -- Every branch is a visible, typed draft state that the operator must review.
const InvoiceDraft = ({
  controller,
  label,
  language,
}: {
  readonly controller: ReturnType<typeof useInvoicesController>;
  readonly label: (key: string) => string;
  readonly language: string;
}) => {
  const { selected: invoice, support } = controller.state;
  const [description, setDescription] = useState(support?.invoice.description ?? '');
  const [paymentTermId, setPaymentTermId] = useState(support?.invoice.paymentTermRef?.resourceId ?? '');
  const savedSelection = support?.invoice.recipientAddressSelection ?? null;
  const [selection, setSelection] = useState<RecipientAddressSelection | null>(() => {
    if (support === null) {
      return null;
    }
    const preferredAddresses = support.billingAddresses.filter((candidate) => candidate.preferred);
    const [preferredAddress] = preferredAddresses;
    return (
      (savedSelection?.kind === 'PARTY_CONTACT_POINT' ? savedSelection : null) ??
      (preferredAddresses.length === 1 && preferredAddress !== undefined
        ? { contactPointRef: preferredAddress.contactPointRef, kind: 'PARTY_CONTACT_POINT' }
        : null)
    );
  });
  const [oneTime, setOneTime] = useState(savedSelection?.kind === 'ONE_TIME');
  const [address, setAddress] = useState<InvoiceAddress>(
    savedSelection?.kind === 'ONE_TIME'
      ? savedSelection.address
      : {
          addressLine1: null,
          addressLine2: null,
          city: null,
          countryCode: 'CZ',
          postalCode: null,
          region: null,
        },
  );
  if (invoice === null || support === null) {
    return null;
  }
  const currentSelection: RecipientAddressSelection | null = oneTime ? { address, kind: 'ONE_TIME' } : selection;
  const addressComplete =
    !oneTime ||
    [address.addressLine1, address.addressLine2, address.city, address.postalCode].filter((part) => part !== null)
      .length >= 2;
  const dirty =
    description.trim() !== invoice.description ||
    paymentTermId !== (invoice.paymentTermRef?.resourceId ?? '') ||
    !selectionsEqual(currentSelection, invoice.recipientAddressSelection);
  const selectedTerm = support.paymentTerms.find((term) => term.paymentTermRef.resourceId === paymentTermId);
  const handleSave = () => controller.save({ description, paymentTermId, selection: currentSelection });
  const handleIssue = () => controller.issue();
  return (
    <div className="billingdocuments:grid billingdocuments:gap-4">
      <section className={card}>
        <p className="billingdocuments:text-sm billingdocuments:font-semibold billingdocuments:text-stone-500">
          {label('draft')}
        </p>
        <h2 className="billingdocuments:text-2xl billingdocuments:font-bold">{support.recipientDisplayName}</h2>
        <p>{money(invoice.commercialSnapshot.total, invoice.commercialSnapshot.currency, language)}</p>
        <p>
          {label('supplier')}: {support.issuerLegalName}
        </p>
        <p>
          {label('job')}: {support.sourceJobDisplayName}
        </p>
        <p>
          {label('estimatedDueAt')}: {estimatedDueText(selectedTerm?.semantics, language)}
        </p>
        <p className="billingdocuments:text-sm billingdocuments:text-stone-600">
          {label(`priceBasis.${invoice.commercialSnapshot.priceBasis}`)}
        </p>
      </section>
      <label className="billingdocuments:grid billingdocuments:gap-2">
        <span>{label('description')}</span>
        <input
          className={field}
          maxLength={500}
          onChange={(event) => setDescription(event.currentTarget.value)}
          value={description}
        />
      </label>
      <fieldset className={`${card} billingdocuments:grid billingdocuments:gap-3`}>
        <legend className="billingdocuments:px-1 billingdocuments:font-semibold">{label('billingAddress')}</legend>
        {support.billingAddresses.map((candidate) => (
          <label
            className="billingdocuments:flex billingdocuments:min-w-0 billingdocuments:items-start billingdocuments:gap-3"
            key={candidate.contactPointRef.resourceId}
          >
            <input
              checked={
                !oneTime &&
                selection?.kind === 'PARTY_CONTACT_POINT' &&
                selection.contactPointRef.resourceId === candidate.contactPointRef.resourceId
              }
              name="billing-address"
              onChange={() => {
                setOneTime(false);
                setSelection({ contactPointRef: candidate.contactPointRef, kind: 'PARTY_CONTACT_POINT' });
              }}
              type="radio"
            />
            <span className="billingdocuments:min-w-0 billingdocuments:break-words">
              {addressText(candidate.address)}
              {candidate.preferred ? ` · ${label('preferred')}` : ''}
            </span>
          </label>
        ))}
        <label className="billingdocuments:flex billingdocuments:items-center billingdocuments:gap-3">
          <input checked={oneTime} name="billing-address" onChange={() => setOneTime(true)} type="radio" />
          {label('oneTimeAddress')}
        </label>
        {oneTime && (
          <div className="billingdocuments:grid billingdocuments:gap-3 billingdocuments:sm:grid-cols-2">
            <input
              aria-label={label('street')}
              className={field}
              onChange={(event) => setAddress({ ...address, addressLine1: event.currentTarget.value || null })}
              placeholder={label('street')}
              value={address.addressLine1 ?? ''}
            />
            <input
              aria-label={label('city')}
              className={field}
              onChange={(event) => setAddress({ ...address, city: event.currentTarget.value || null })}
              placeholder={label('city')}
              value={address.city ?? ''}
            />
            <input
              aria-label={label('postalCode')}
              className={field}
              onChange={(event) => setAddress({ ...address, postalCode: event.currentTarget.value || null })}
              placeholder={label('postalCode')}
              value={address.postalCode ?? ''}
            />
            <input
              aria-label={label('country')}
              className={field}
              maxLength={2}
              onChange={(event) => setAddress({ ...address, countryCode: event.currentTarget.value.toUpperCase() })}
              placeholder={label('countryPlaceholder')}
              value={address.countryCode}
            />
          </div>
        )}
      </fieldset>
      <label className="billingdocuments:grid billingdocuments:gap-2">
        <span>{label('paymentTerm')}</span>
        <select
          className={field}
          onChange={(event) => setPaymentTermId(event.currentTarget.value)}
          value={paymentTermId}
        >
          <option value="">{label('choose')}</option>
          {support.paymentTerms.map((term) => (
            <option key={term.paymentTermRef.resourceId} value={term.paymentTermRef.resourceId}>
              {term.name}
            </option>
          ))}
        </select>
      </label>
      {invoice.commercialSnapshot.priceBasis === 'EXCLUDING_VAT' && (
        <output className="billingdocuments:rounded-xl billingdocuments:bg-amber-50 billingdocuments:p-4">
          {label('taxRequired')}
        </output>
      )}
      {dirty && (
        <output className="billingdocuments:text-sm billingdocuments:text-amber-800">{label('unsaved')}</output>
      )}
      <div className="billingdocuments:flex billingdocuments:flex-col billingdocuments:gap-3 billingdocuments:sm:flex-row">
        <Button
          disabled={controller.state.pending || description.trim() === '' || !addressComplete || !dirty}
          onClick={handleSave}
          size="lg"
        >
          {label('save')}
        </Button>
        <Button
          disabled={
            controller.state.pending ||
            invoice.paymentTermRef === null ||
            invoice.recipientAddressSelection === null ||
            invoice.commercialSnapshot.priceBasis === 'EXCLUDING_VAT' ||
            dirty
          }
          onClick={handleIssue}
          size="lg"
          theme="outlined"
        >
          {label('issue')}
        </Button>
      </div>
    </div>
  );
};

const IssuedInvoice = ({
  invoice,
  label,
  language,
}: {
  readonly invoice: NonNullable<ReturnType<typeof useInvoicesController>['state']['selected']>;
  readonly label: (key: string) => string;
  readonly language: string;
}) => {
  const recipient = invoice.recipientSnapshot;
  return (
    <article
      className={`${card} billingdocuments:print:border-0 billingdocuments:print:shadow-none`}
      data-testid="issued-invoice"
    >
      <header className="billingdocuments:flex billingdocuments:flex-wrap billingdocuments:items-start billingdocuments:justify-between billingdocuments:gap-4">
        <div>
          <p className="billingdocuments:text-sm billingdocuments:font-semibold">{label('issued')}</p>
          <h2 className="billingdocuments:text-3xl billingdocuments:font-black">
            {label('invoice')} {invoice.invoiceNumber}
          </h2>
        </div>
        <Button className="billingdocuments:print:hidden" onClick={() => window.print()} theme="outlined">
          {label('print')}
        </Button>
      </header>
      <div className="billingdocuments:mt-8 billingdocuments:grid billingdocuments:gap-6 billingdocuments:md:grid-cols-2">
        <section>
          <h3 className="billingdocuments:font-bold">{label('supplier')}</h3>
          <p>{invoice.issuerSnapshot?.legalName}</p>
        </section>
        <section>
          <h3 className="billingdocuments:font-bold">{label('recipient')}</h3>
          <p>{recipient?.displayName}</p>
          <p>{recipient === null ? '—' : addressText(recipient.address)}</p>
          {recipient?.officialIdentifiers.map((id) => (
            <p key={id.identifierType}>
              {id.identifierType}: {id.normalizedValue}
            </p>
          ))}
        </section>
        <section>
          <h3 className="billingdocuments:font-bold">{label('dates')}</h3>
          <p>
            {label('issuedAt')}: {dateText(invoice.issuedAt, language)}
          </p>
          <p>
            {label('dueAt')}: {dateText(invoice.dueAt, language)}
          </p>
        </section>
        <section>
          <h3 className="billingdocuments:font-bold">{label('paymentTerm')}</h3>
          <p>{invoice.paymentTermSnapshot?.name}</p>
        </section>
      </div>
      <div className="billingdocuments:mt-8 billingdocuments:grid billingdocuments:grid-cols-[1fr_auto] billingdocuments:gap-4 billingdocuments:border-t billingdocuments:border-stone-300 billingdocuments:pt-4">
        <p>{invoice.description}</p>
        <strong>{money(invoice.commercialSnapshot.total, invoice.commercialSnapshot.currency, language)}</strong>
      </div>
      <p className="billingdocuments:mt-2 billingdocuments:text-right billingdocuments:text-sm">
        {label(`priceBasis.${invoice.commercialSnapshot.priceBasis}`)}
      </p>
    </article>
  );
};

// eslint-disable-next-line complexity -- The single responsive page renders the explicit list, create, and detail states.
export const InvoicesPage = () => {
  const { language, t } = useModernI18n();
  const label = (key: string) => t(`billing-documents.demo.${key}`);
  const controller = useInvoicesController();
  const { state } = controller;
  const [search, setSearch] = useState('');
  const handleBack = () => controller.back();
  const handleLoadMoreInvoices = () => controller.loadMoreInvoices();
  const handleLoadMoreJobs = () => controller.loadMoreJobs();
  const handleNewInvoice = () => controller.newInvoice();
  const visibleInvoices = state.invoices.filter(({ customerDisplayName, invoice, sourceJobDisplayName }) =>
    `${invoice.invoiceNumber ?? ''} ${customerDisplayName} ${sourceJobDisplayName} ${invoice.commercialSnapshot.total}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <UltramodernRouteHead />
      <main className="billingdocuments:mx-auto billingdocuments:w-full billingdocuments:max-w-6xl billingdocuments:min-w-0 billingdocuments:px-4 billingdocuments:py-6 billingdocuments:break-words billingdocuments:sm:px-8">
        <header className="billingdocuments:mb-6 billingdocuments:flex billingdocuments:flex-wrap billingdocuments:items-end billingdocuments:justify-between billingdocuments:gap-4">
          <div>
            <p className="billingdocuments:text-sm billingdocuments:font-semibold billingdocuments:uppercase billingdocuments:text-stone-500">
              SOS vyklízení
            </p>
            <h1 className="billingdocuments:text-3xl billingdocuments:font-black billingdocuments:sm:text-4xl">
              {label('title')}
            </h1>
            <p className="billingdocuments:mt-2 billingdocuments:text-stone-600">{label('intro')}</p>
          </div>
          {state.view === 'list' ? (
            <Button onClick={handleNewInvoice} size="lg">
              {label('new')}
            </Button>
          ) : (
            <Button disabled={state.pending} onClick={handleBack} size="lg" theme="outlined">
              {label('back')}
            </Button>
          )}
        </header>
        <ErrorPanel controller={controller} label={label} />
        {state.pending && (
          <output aria-live="polite" className="billingdocuments:my-3 billingdocuments:block">
            {label('saving')}
          </output>
        )}
        {state.loading && (
          <output aria-live="polite" className="billingdocuments:block billingdocuments:py-8">
            {label('loading')}
          </output>
        )}
        {!state.loading && (state.error === null || state.invoices.length > 0) && state.view === 'list' && (
          <div className="billingdocuments:grid billingdocuments:gap-4">
            <input
              aria-label={label('search')}
              className={field}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={label('search')}
              type="search"
              value={search}
            />
            {visibleInvoices.length === 0 ? (
              <p className={card}>{label('empty')}</p>
            ) : (
              <ul className="billingdocuments:grid billingdocuments:gap-4 billingdocuments:md:grid-cols-2">
                {visibleInvoices.map(({ customerDisplayName, invoice, sourceJobDisplayName }) => (
                  <li className={`${card} billingdocuments:grid billingdocuments:gap-3`} key={invoice.ref.resourceId}>
                    <div>
                      <p className="billingdocuments:text-sm billingdocuments:font-semibold billingdocuments:text-stone-500">
                        {invoice.status === 'DRAFT' ? label('draft') : invoice.invoiceNumber}
                      </p>
                      <h2 className="billingdocuments:text-xl billingdocuments:font-bold">
                        {customerDisplayName || label('customerUnavailable')}
                      </h2>
                      <p>
                        {label('job')}: {sourceJobDisplayName}
                      </p>
                      <p>{money(invoice.commercialSnapshot.total, invoice.commercialSnapshot.currency, language)}</p>
                      <p>
                        {label(`status.${invoice.status}`)} · {label('issuedAt')}:{' '}
                        {dateText(invoice.issuedAt, language)} · {label('dueAt')}: {dateText(invoice.dueAt, language)}
                      </p>
                    </div>
                    <Button onClick={() => controller.open(invoice)} theme="outlined">
                      {label('open')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {state.invoiceCursor !== null && (
              <Button onClick={handleLoadMoreInvoices} theme="outlined">
                {label('loadMore')}
              </Button>
            )}
          </div>
        )}
        {!state.loading && state.view === 'create' && (
          <section className="billingdocuments:grid billingdocuments:gap-4">
            <h2 className="billingdocuments:text-2xl billingdocuments:font-bold">{label('chooseJob')}</h2>
            {state.loadingJobs && (
              <output aria-live="polite" className="billingdocuments:block billingdocuments:py-8">
                {label('loading')}
              </output>
            )}
            {!state.loadingJobs && state.error === null && state.jobs.length === 0 && (
              <p className={card}>{label('noJobs')}</p>
            )}
            {state.jobs.length > 0 && (
              <ul className="billingdocuments:grid billingdocuments:gap-4 billingdocuments:md:grid-cols-2">
                {state.jobs.map((job) => (
                  <li className={`${card} billingdocuments:grid billingdocuments:gap-3`} key={job.ref.resourceId}>
                    <div>
                      <h3 className="billingdocuments:text-lg billingdocuments:font-bold">
                        {job.serviceScope.description}
                      </h3>
                      <p>{job.serviceLocation.city}</p>
                      <p>{money(job.commercialSummary.total, job.commercialSummary.currency, language)}</p>
                    </div>
                    <Button disabled={state.pending} onClick={() => controller.create(job)}>
                      {label('createDraft')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {state.jobCursor !== null && (
              <Button disabled={state.loadingJobs} onClick={handleLoadMoreJobs} theme="outlined">
                {label('loadMore')}
              </Button>
            )}
          </section>
        )}
        {!state.loading && state.view === 'detail' && state.selected?.status === 'DRAFT' && (
          <InvoiceDraft
            controller={controller}
            key={`${state.selected.ref.resourceId}:${state.selected.revision.toString()}`}
            label={label}
            language={language}
          />
        )}
        {!state.loading && state.view === 'detail' && state.selected?.status === 'ISSUED' && (
          <IssuedInvoice invoice={state.selected} label={label} language={language} />
        )}
      </main>
    </>
  );
};
export default InvoicesPage;
