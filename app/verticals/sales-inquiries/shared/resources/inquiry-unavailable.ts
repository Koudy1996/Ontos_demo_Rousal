import { Schema } from 'effect';

export class InquiryUnavailable extends Schema.TaggedError<InquiryUnavailable>()('InquiryUnavailable', {
  code: Schema.Literal('inquiry_unavailable'),
  reason: Schema.String,
}) {}
