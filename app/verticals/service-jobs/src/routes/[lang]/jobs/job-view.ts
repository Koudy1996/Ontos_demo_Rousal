import { DateTime, Option } from 'effect';

export const formClass = 'servicejobs:flex servicejobs:flex-col servicejobs:gap-4';
export const localInput = (value: string | null) =>
  value === null
    ? ''
    : Option.match(DateTime.makeZoned(value, { timeZone: 'Europe/Prague' }), {
        onNone: () => '',
        onSome: (date) => DateTime.formatIsoZoned(date).slice(0, 16),
      });
export const views = ['ALL', 'TODAY', 'UPCOMING', 'IN_PROGRESS', 'COMPLETED'] as const;
