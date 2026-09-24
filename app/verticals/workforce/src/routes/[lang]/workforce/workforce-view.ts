import { DateTime, Option } from 'effect';
import type { Availability } from '../../../../shared/workforce-views.ts';

export const stackClass = 'workforce:flex workforce:flex-col workforce:gap-4 workforce:min-w-0';
export const cardClass =
  'workforce:rounded-lg workforce:border workforce:border-(--color-border) workforce:p-4 workforce:min-w-0 workforce:break-words';
export const selectClass =
  'workforce:w-full workforce:min-h-12 workforce:rounded workforce:border workforce:bg-(--color-page-bg) workforce:p-3';
export const inputDate = (value: DateTime.Utc) =>
  Option.match(DateTime.makeZoned(value, { timeZone: 'Europe/Prague' }), {
    onNone: () => '',
    onSome: (date) => DateTime.formatIsoZoned(date).slice(0, 16).replace('T', ' '),
  });
export const availabilityLabel = (value: Availability, label: (key: string) => string) => {
  const state = label(`availability.${value.state}`);
  if (Option.isNone(value.absenceReason)) {
    return state;
  }
  const reason = label(`reason.${value.absenceReason.value}`);
  return `${state} — ${reason}`;
};
export const moveWeek = (date: string, days: number) =>
  DateTime.formatIsoDateUtc(DateTime.add(DateTime.makeUnsafe(`${date}T00:00:00Z`), { days }));
