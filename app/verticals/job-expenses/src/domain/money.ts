import { Effect, Schema } from 'effect';
import { JobExpenseRejected, JobExpenseUnavailable } from '../../shared/resources/job-expense-failure.ts';

const canonicalMoneyPattern = /^(?<sign>-?)(?<units>\d+)\.(?<fraction>\d{2})$/u;

export const moneyToCents = (value: string) => {
  const match = canonicalMoneyPattern.exec(value);
  if (match?.groups === undefined) {
    return Effect.fail(new JobExpenseRejected({ code: 'invalid_expense', reason: 'Invalid money value' }));
  }
  return Schema.decodeEffect(Schema.BigIntFromString)(
    `${match.groups['sign']}${match.groups['units']}${match.groups['fraction']}`,
  ).pipe(
    Effect.mapError((cause) =>
      Object.defineProperty(
        new JobExpenseRejected({ code: 'invalid_expense', reason: 'Invalid money value' }),
        'cause',
        { enumerable: false, value: cause },
      ),
    ),
  );
};

export const databaseMoneyToCents = (value: string) => {
  let normalized = value;
  if (/^-?\d+$/u.test(value)) {
    normalized = `${value}.00`;
  } else if (/^-?\d+\.\d$/u.test(value)) {
    normalized = `${value}0`;
  }
  return moneyToCents(normalized).pipe(
    Effect.mapError((cause) =>
      Object.defineProperty(
        new JobExpenseUnavailable({ code: 'job_expenses_unavailable', reason: 'Expense totals are unavailable' }),
        'cause',
        { enumerable: false, value: cause },
      ),
    ),
  );
};

export const centsToMoney = (cents: bigint) => {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const units = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${units.toString()}.${fraction}`;
};

/** Percentage with two decimals, half-up with ties away from zero. */
export const marginPercent = (differenceCents: bigint, priceCents: bigint) => {
  if (priceCents <= 0n) {
    return null;
  }
  const numerator = differenceCents * 10_000n;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const roundedHundredths = (absolute + priceCents / 2n) / priceCents;
  const signed = negative ? -roundedHundredths : roundedHundredths;
  return centsToMoney(signed);
};
