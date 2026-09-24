import { Schema } from 'effect';

export class InvoiceUnavailable extends Schema.TaggedError<InvoiceUnavailable>()('InvoiceUnavailable', {
  code: Schema.Literal('billing_documents_unavailable'),
  reason: Schema.String,
}) {}
