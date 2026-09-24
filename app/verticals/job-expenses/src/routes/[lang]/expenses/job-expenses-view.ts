export const cardClass =
  'jobexpenses:min-w-0 jobexpenses:rounded-2xl jobexpenses:border jobexpenses:border-stone-200 jobexpenses:bg-white jobexpenses:p-4 jobexpenses:shadow-sm';
export const stackClass = 'jobexpenses:grid jobexpenses:min-w-0 jobexpenses:gap-4';
export const selectClass =
  'jobexpenses:min-h-12 jobexpenses:w-full jobexpenses:rounded-lg jobexpenses:border jobexpenses:border-stone-300 jobexpenses:bg-white jobexpenses:px-3 jobexpenses:text-base';
export const textareaClass =
  'jobexpenses:min-h-28 jobexpenses:w-full jobexpenses:rounded-lg jobexpenses:border jobexpenses:border-stone-300 jobexpenses:bg-white jobexpenses:px-3 jobexpenses:py-2 jobexpenses:text-base';

export const formatMoney = (value: string, label: (key: string) => string) => {
  const [signedUnits = '0', fraction = '00'] = value.split('.');
  const negative = signedUnits.startsWith('-');
  const units = negative ? signedUnits.slice(1) : signedUnits;
  const grouped = units.replaceAll(/\B(?=(?<thousands>\d{3})+(?!\d))/gu, '\u00A0');
  return `${negative ? '−' : ''}${grouped}${label('money.decimalSeparator')}${fraction} ${label('money.currency')}`;
};
