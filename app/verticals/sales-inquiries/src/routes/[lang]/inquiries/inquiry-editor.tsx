import { Button } from '@techsio/ui-kit/atoms/button';
import { FormInput } from '@techsio/ui-kit/molecules/form-input';

import {
  fields,
  inquiryInputType,
  elevatorInput,
  visitInput,
  formClass,
  InquirySelect,
} from './inquiry-form-fields.tsx';
import type { useInquiriesController } from './use-inquiries-controller.ts';

interface ViewProps {
  readonly controller: ReturnType<typeof useInquiriesController>;
  readonly label: (key: string) => string;
}
export const InquiryEditor = ({ controller, label }: ViewProps) => {
  const { detailsSubmit, dispatch, locked, search, state } = controller;
  const { creating, names, parties, party, searching, selected } = state;
  const fieldDefault = (name: (typeof fields)[number]) => {
    if (creating || selected === null) {
      return name === 'countryCode' ? 'CZ' : '';
    }
    if (name === 'addressLine' || name === 'city' || name === 'postalCode' || name === 'countryCode') {
      return selected.location[name];
    }
    if (name === 'siteVisitAt') {
      return visitInput(selected.siteVisitAt);
    }
    return selected[name] ?? '';
  };

  return (
    <div className={formClass}>
      <h2 className="salesinquiries:text-xl salesinquiries:font-semibold">{label(creating ? 'new' : 'edit')}</h2>
      <form action={search} className={formClass}>
        <FormInput
          disabled={locked}
          id="party-query"
          label={label('contactSearch')}
          maxLength={200}
          minLength={1}
          name="query"
          required
        />
        <Button disabled={locked || searching} size="lg" type="submit">
          {label('search')}
        </Button>
      </form>
      {searching && <output>{label('loading')}</output>}
      <ul aria-label={label('contactResults')}>
        {parties.map((item) => (
          <li key={item.partyRef.resourceId}>
            <Button disabled={locked} onClick={() => dispatch({ party: item })} size="lg" theme="outlined">
              {item.title}
            </Button>
          </li>
        ))}
      </ul>
      <p>
        {label('contact')}:{' '}
        {party?.title ?? (selected === null ? label('chooseContact') : names.get(selected.partyRef.resourceId))}
      </p>
      <form action={detailsSubmit} className={formClass}>
        <fieldset className={formClass} disabled={locked}>
          <legend>{label('details')}</legend>
          <InquirySelect
            current={creating ? 'APARTMENT' : (selected?.objectType ?? 'APARTMENT')}
            label={label}
            locked={locked}
            name="objectType"
            values={['APARTMENT', 'HOUSE', 'COMMERCIAL', 'OTHER']}
          />
          {fields.map((name) => (
            <FormInput
              defaultValue={fieldDefault(name)}
              id={name}
              key={`${name}-${selected?.revision ?? 'new'}`}
              label={label(name)}
              name={name}
              required={['addressLine', 'city', 'postalCode'].includes(name)}
              type={inquiryInputType(name)}
            />
          ))}
          <InquirySelect
            current={elevatorInput(creating ? null : selected?.elevator)}
            label={label}
            locked={locked}
            name="elevator"
            values={['', 'yes', 'no']}
          />
        </fieldset>
        <Button block disabled={locked || (party === null && (creating || selected === null))} size="lg" type="submit">
          {label('save')}
        </Button>
      </form>
      <Button
        disabled={locked}
        onClick={() => {
          dispatch({ creating: false });
          dispatch({ editing: false });
        }}
        size="lg"
        theme="outlined"
      >
        {label('cancel')}
      </Button>
    </div>
  );
};
