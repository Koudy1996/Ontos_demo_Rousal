import { Schema } from 'effect';

export class InquiryPartyFailure extends Schema.TaggedError<InquiryPartyFailure>()('InquiryPartyFailure', {
  code: Schema.Literals(['authentication', 'forbidden', 'not_found', 'invalid', 'internal', 'conflict', 'ineligible']),
  reason: Schema.String,
}) {}
