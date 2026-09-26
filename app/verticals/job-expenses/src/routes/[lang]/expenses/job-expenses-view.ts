export const cardClass =
  'jobexpenses:min-w-0 jobexpenses:rounded-2xl jobexpenses:border jobexpenses:border-um-border jobexpenses:bg-um-surface jobexpenses:p-4 jobexpenses:shadow-sm';
export const stackClass = 'jobexpenses:grid jobexpenses:min-w-0 jobexpenses:gap-4';
export const selectClass =
  'jobexpenses:min-h-12 jobexpenses:w-full jobexpenses:rounded-lg jobexpenses:border jobexpenses:border-um-border jobexpenses:bg-um-surface jobexpenses:px-3 jobexpenses:text-base jobexpenses:focus-visible:outline-2 jobexpenses:focus-visible:outline-offset-2 jobexpenses:focus-visible:outline-um-link';
export const textareaClass =
  'jobexpenses:min-h-28 jobexpenses:w-full jobexpenses:rounded-lg jobexpenses:border jobexpenses:border-um-border jobexpenses:bg-um-surface jobexpenses:px-3 jobexpenses:py-2 jobexpenses:text-base jobexpenses:focus-visible:outline-2 jobexpenses:focus-visible:outline-offset-2 jobexpenses:focus-visible:outline-um-link';

export const formatMoney = (value: string, label: (key: string) => string) => {
  const [signedUnits = '0', fraction = '00'] = value.split('.');
  const negative = signedUnits.startsWith('-');
  const units = negative ? signedUnits.slice(1) : signedUnits;
  const grouped = units.replaceAll(/\B(?=(?<thousands>\d{3})+(?!\d))/gu, '\u00A0');
  return `${negative ? '−' : ''}${grouped}${label('money.decimalSeparator')}${fraction} ${label('money.currency')}`;
};
