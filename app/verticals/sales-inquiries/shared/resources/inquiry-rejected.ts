import { Schema } from 'effect';

export class InquiryRejected extends Schema.TaggedError<InquiryRejected>()('InquiryRejected', {
  code: Schema.Literals([
    'not_found',
    'revision_conflict',
    'invalid_transition',
    'commercial_frozen',
    'offer_required',
    'party_invalid',
  ]),
  reason: Schema.String,
}) {}
