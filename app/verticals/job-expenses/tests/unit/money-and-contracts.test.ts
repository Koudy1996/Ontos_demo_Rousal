import { expect, it } from 'effect-rstest';
import { Effect, Result, Schema } from 'effect';
import { JobExpenseAmountCzkSchema } from '../../shared/resources/job-expense.ts';
import { centsToMoney, marginPercent, moneyToCents } from '../../src/domain/money.ts';

it.effect('adds decimal money exactly and rounds signed percentages half-up away from zero', () =>
  Effect.gen(function* exactMoney() {
    const first = yield* moneyToCents('0.10');
    const second = yield* moneyToCents('0.20');
    expect(centsToMoney(first + second)).toBe('0.30');
    expect(centsToMoney((yield* moneyToCents('999999999999.99')) * 3n)).toBe('2999999999999.97');
    expect(marginPercent(900_000n, 2_000_000n)).toBe('45.00');
    expect(marginPercent(-1n, 32n)).toBe('-3.13');
    expect(marginPercent(1n, 32n)).toBe('3.13');
    expect(marginPercent(1n, 0n)).toBeNull();
  }),
);

it('rejects zero, negative, exponents and non-canonical decimals', () => {
  const decodeMoney = Schema.decodeResult(JobExpenseAmountCzkSchema);
  for (const value of ['0.00', '-1.00', '1e2', '1', '1.0', '1.001', 'Infinity', 'NaN']) {
    expect(Result.isFailure(decodeMoney(value))).toBe(true);
  }
  expect(Result.isSuccess(decodeMoney('0.01'))).toBe(true);
});
