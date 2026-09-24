import type { PaymentTermSemantics } from '@app/payment-term-catalog-contracts/payment-term';
import { DateTime, Effect, Option } from 'effect';
import { InvoiceRejected } from '../../shared/resources/invoice-rejected.ts';

/** Billing-owned interpretation of the launch Payment Term compatibility profile. */
export const calculateInvoiceDueAt = (
  issuedAt: DateTime.Utc,
  semantics: PaymentTermSemantics,
): Effect.Effect<DateTime.Utc, InvoiceRejected> => {
  if (semantics.kind === 'IMMEDIATE') {
    return Effect.succeed(issuedAt);
  }
  const source = DateTime.toDateUtc(issuedAt);
  source.setUTCDate(source.getUTCDate() + semantics.days);
  const dueAt = DateTime.make(source);
  return source.getUTCFullYear() > 9999 || Option.isNone(dueAt)
    ? Effect.fail(
        new InvoiceRejected({
          code: 'due_date_out_of_range',
          reason: 'Splatnost je mimo podporovaný rozsah data',
        }),
      )
    : Effect.succeed(dueAt.value);
};
