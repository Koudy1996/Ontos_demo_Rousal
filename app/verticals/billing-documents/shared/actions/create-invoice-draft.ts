import { PaymentTermRefSchema } from '@app/payment-term-catalog-contracts/resources/payment-term';
import { ServiceJobRefSchema } from '@app/service-jobs/resources/service-job';
import { Schema } from 'effect';
import { InvoiceSchema, RecipientAddressSelectionSchema } from '../resources/invoice.ts';

export const CreateInvoiceDraftPayloadSchema = Schema.Struct({
  description: Schema.optionalKey(Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(500))),
  paymentTermRef: Schema.optionalKey(PaymentTermRefSchema),
  recipientAddressSelection: Schema.optionalKey(RecipientAddressSelectionSchema),
  sourceJobRef: ServiceJobRefSchema,
});
export type CreateInvoiceDraftPayload = typeof CreateInvoiceDraftPayloadSchema.Type;
export const CreateInvoiceDraftResultSchema = InvoiceSchema;
export type CreateInvoiceDraftResult = typeof CreateInvoiceDraftResultSchema.Type;
