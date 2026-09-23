import { DateTime, Option, Schema } from 'effect';
import { Select } from '@techsio/ui-kit/molecules/select';

export const fields = [
  'addressLine',
  'city',
  'postalCode',
  'countryCode',
  'description',
  'requestedDate',
  'floor',
  'estimatedVolumeM3',
  'specialWaste',
  'siteVisitAt',
  'internalNote',
] as const;
export const moneyFields = ['work', 'transport', 'disposal', 'material', 'other'] as const;
export const text = (data: FormData, name: string) => {
  const value = data.get(name);
  return Schema.is(Schema.String)(value) ? value.trim() : '';
};
export const nullable = (data: FormData, name: string) => text(data, name) || null;
export const visitInstant = (data: FormData) => {
  const value = text(data, 'siteVisitAt');
  return value === ''
    ? null
    : Option.match(DateTime.makeZoned(value, { adjustForTimeZone: true, timeZone: 'Europe/Prague' }), {
        onNone: () => value,
        onSome: DateTime.formatIso,
      });
};
export const visitInput = (value: string | null) =>
  value === null
    ? ''
    : Option.match(DateTime.makeZoned(value, { timeZone: 'Europe/Prague' }), {
        onNone: () => '',
        onSome: (date) => DateTime.formatIsoZoned(date).slice(0, 16),
      });

export const formClass = 'salesinquiries:flex salesinquiries:flex-col salesinquiries:gap-4';
interface InquirySelectProps {
  readonly current: string;
  readonly label: (key: string) => string;
  readonly locked: boolean;
  readonly name: string;
  readonly onChange?: (value: string) => void;
  readonly values: readonly string[];
}
export const InquirySelect = ({ current, label, locked, name, onChange, values }: InquirySelectProps) => (
  <Select
    defaultValue={[current]}
    disabled={locked}
    items={values.map((value) => ({ label: label(`${name}.${value || 'unknown'}`), value }))}
    key={`${name}-${current}`}
    name={name}
    onValueChange={
      onChange === undefined
        ? undefined
        : ({ value }) => {
            if (value[0] !== undefined) {
              onChange(value[0]);
            }
          }
    }
  >
    <Select.Label>{label(`${name}.label`)}</Select.Label>
    <Select.Control>
      <Select.Trigger>
        <Select.ValueText />
      </Select.Trigger>
    </Select.Control>
    <Select.Positioner>
      <Select.Content>
        {values.map((value) => (
          <Select.Item item={{ label: label(`${name}.${value || 'unknown'}`), value }} key={value}>
            <Select.ItemText />
            <Select.ItemIndicator />
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Positioner>
  </Select>
);

export const inquiryInputType = (name: string) => {
  if (name === 'requestedDate') {
    return 'date';
  }
  if (name === 'siteVisitAt') {
    return 'datetime-local';
  }
  if (name === 'floor') {
    return 'number';
  }
  return 'text';
};
export const elevatorInput = (value: boolean | null | undefined) => {
  if (value === null || value === undefined) {
    return '';
  }
  return value ? 'yes' : 'no';
};
