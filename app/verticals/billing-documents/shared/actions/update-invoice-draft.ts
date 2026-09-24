import { PaymentTermRefSchema } from '@app/payment-term-catalog-contracts/resources/payment-term';
import { Schema } from 'effect';
import { InvoiceRefSchema, InvoiceSchema, RecipientAddressSelectionSchema } from '../resources/invoice.ts';

export const UpdateInvoiceDraftPayloadSchema = Schema.Struct({
  description: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  invoiceRef: InvoiceRefSchema,
  // null explicitly clears the draft selection on the HTTP wire; expires: 2027-09-30.
  // oxlint-disable-next-line effect-native/no-nullable-schema-field
  paymentTermRef: Schema.NullOr(PaymentTermRefSchema),
  // null explicitly clears the draft selection on the HTTP wire; expires: 2027-09-30.
  // oxlint-disable-next-line effect-native/no-nullable-schema-field
  recipientAddressSelection: Schema.NullOr(RecipientAddressSelectionSchema),
});
export type UpdateInvoiceDraftPayload = typeof UpdateInvoiceDraftPayloadSchema.Type;
export const UpdateInvoiceDraftResultSchema = InvoiceSchema;
export type UpdateInvoiceDraftResult = typeof UpdateInvoiceDraftResultSchema.Type;
