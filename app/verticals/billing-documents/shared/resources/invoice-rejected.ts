import { Schema } from 'effect';

export class InvoiceRejected extends Schema.TaggedError<InvoiceRejected>()('InvoiceRejected', {
  code: Schema.Literals([
    'address_not_current',
    'due_date_out_of_range',
    'invoice_already_exists',
    'invoice_not_draft',
    'job_not_completed',
    'job_not_found',
    'missing_billing_address',
    'not_found',
    'payment_term_required',
    'payment_term_unusable',
    'revision_conflict',
    'scope_mismatch',
    'source_job_changed',
    'tax_data_required',
  ]),
  reason: Schema.String,
}) {}
