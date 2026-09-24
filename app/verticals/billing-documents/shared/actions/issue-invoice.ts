import { Schema } from 'effect';
import { InvoiceRefSchema, InvoiceSchema } from '../resources/invoice.ts';

export const IssueInvoicePayloadSchema = Schema.Struct({
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  invoiceRef: InvoiceRefSchema,
});
export type IssueInvoicePayload = typeof IssueInvoicePayloadSchema.Type;
export const IssueInvoiceResultSchema = InvoiceSchema;
export type IssueInvoiceResult = typeof IssueInvoiceResultSchema.Type;
